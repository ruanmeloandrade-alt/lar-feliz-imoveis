"""Generate a reviewed, atomic ERP import. Does not connect to production."""
import argparse
import csv
import hashlib
import io
import json
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid5

HEADERS = ['Código', 'Nome', 'Categoria', 'Unit / Frac.', 'Estoque Atual', 'Estoque Minimo', 'Preço de Custo', 'Preço de Venda', 'Valor Estoque Atual', 'Custo Estoque Atual', 'Valor vendido', 'Quantidade vendida', 'Lucro']


def number(value):
    value = value.strip()
    if not value:
        return None
    result = Decimal(value.replace('.', '').replace(',', '.'))
    if not result.is_finite():
        raise ValueError('Número não finito')
    return str(result)


def family(name):
    name = name.upper()
    if name.startswith('TG '): return 'TG'
    if 'TIRZEC' in name: return 'Tirzec'
    if 'LIPOLESS' in name: return 'Lipoless'
    if name.startswith(('RETATRUT', 'RETA ')): return 'Retatrutida e Reta'
    if 'LANDERLAN' in name: return 'Landerlan'
    if name.startswith(('AGUA BACT', 'ÁGUA BACT', 'CAIXA SERINGA')): return 'Insumos'
    return 'Catalogo principal'


def prepare(source, workspace, default_catalog):
    data = Path(source).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    if reader.fieldnames != HEADERS:
        raise ValueError('Colunas diferentes do modelo aprovado')
    catalogs = {'Catalogo principal': str(UUID(default_catalog))}
    products = []
    names = set()
    for line, raw in enumerate(reader, 2):
        if None in raw or any(v is None for v in raw.values()):
            raise ValueError(f'Linha incompleta: {line}')
        if not any(raw.values()): continue
        name = raw['Nome'].strip()
        if not name or name.casefold() in names:
            raise ValueError(f'Nome vazio ou duplicado: {line}')
        names.add(name.casefold())
        numbers = {key: number(raw[key]) for key in HEADERS[4:]}
        for key in HEADERS[4:6]:
            value = numbers[key]
            if value is not None:
                d = Decimal(value)
                if d != d.to_integral_value() or not -2147483648 <= d <= 2147483647 or (key == HEADERS[5] and d < 0):
                    raise ValueError(f'Estoque inválido: {line}')
        for key in HEADERS[6:8]:
            value = numbers[key]
            if value is None or Decimal(value) < 0 or Decimal(value) != Decimal(value).quantize(Decimal('.01')):
                raise ValueError(f'Preço inválido: {line}')
        group = family(name)
        catalogs.setdefault(group, str(uuid5(UUID(workspace), 'catalog:csv:' + group)))
        products.append({
            'id': str(uuid5(UUID(workspace), sha + ':' + str(line))),
            'workspace_id': workspace, 'catalog_id': catalogs[group],
            'name': name, 'sku': raw['Código'].strip(), 'category': raw['Categoria'].strip(),
            'description': '', 'image': '', 'active': True,
            'price': numbers['Preço de Venda'], 'cost_price': numbers['Preço de Custo'],
            'stock': int(Decimal(numbers['Estoque Atual'] or '0')),
            'stock_known': numbers['Estoque Atual'] is not None,
            'minimum_stock': None if numbers['Estoque Minimo'] is None else int(Decimal(numbers['Estoque Minimo'])),
            'unit': raw['Unit / Frac.'].strip(),
            'import_snapshot': {'source_file': Path(source).name, 'sha256': sha, 'source_line': line, 'raw': raw, 'numbers': numbers}
        })
    if not products: raise ValueError('Arquivo sem produtos')
    return {'sha256': sha, 'workspace_id': workspace, 'default_catalog': default_catalog,
            'catalogs': [{'id': ident, 'workspace_id': workspace, 'name': name} for name, ident in catalogs.items()], 'products': products}


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def operation(manifest):
    products = sql_literal(json.dumps(manifest['products'], ensure_ascii=False))
    catalogs = sql_literal(json.dumps(manifest['catalogs'], ensure_ascii=False))
    workspace = sql_literal(manifest['workspace_id'])
    default = sql_literal(manifest['default_catalog'])
    return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtext('products-csv:' || {workspace}));
CREATE TEMP TABLE import_products ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset({products}::jsonb) AS p(id uuid,workspace_id uuid,catalog_id uuid,name text,sku text,category text,description text,image text,active boolean,price numeric,cost_price numeric,stock integer,stock_known boolean,minimum_stock integer,unit text,import_snapshot jsonb);
CREATE TEMP TABLE import_catalogs ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset({catalogs}::jsonb) AS c(id uuid,workspace_id uuid,name text);
DO $guard$ BEGIN
IF NOT EXISTS(SELECT 1 FROM product_catalogs WHERE id={default}::uuid AND workspace_id={workspace}::uuid) THEN RAISE EXCEPTION 'Catálogo base não pertence à empresa'; END IF;
IF EXISTS(SELECT 1 FROM products p JOIN import_products i ON p.workspace_id=i.workspace_id AND lower(trim(p.name))=lower(trim(i.name)) WHERE p.id<>i.id) THEN RAISE EXCEPTION 'Produto já existe com outro identificador'; END IF;
IF EXISTS(SELECT 1 FROM products p JOIN import_products i ON p.id=i.id WHERE (to_jsonb(p)-'created_at'-'updated_at'-'promo_price') IS DISTINCT FROM to_jsonb(i)) THEN RAISE EXCEPTION 'Produto importado foi alterado; nenhuma sobrescrita autorizada'; END IF;
IF EXISTS(SELECT 1 FROM product_catalogs c JOIN import_catalogs i ON c.id=i.id WHERE c.workspace_id<>i.workspace_id OR c.name<>i.name) THEN RAISE EXCEPTION 'Conflito de catálogo'; END IF;
END $guard$;
INSERT INTO product_catalogs(id,workspace_id,name) SELECT id,workspace_id,name FROM import_catalogs ON CONFLICT(id) DO NOTHING;
INSERT INTO products(id,workspace_id,catalog_id,name,sku,category,description,image,active,price,cost_price,stock,stock_known,minimum_stock,unit,import_snapshot)
SELECT id,workspace_id,catalog_id,name,sku,category,description,image,active,price,cost_price,stock,stock_known,minimum_stock,unit,import_snapshot FROM import_products ON CONFLICT(id) DO NOTHING;
DO $verify$ BEGIN
IF (SELECT count(*) FROM products p JOIN import_products i ON p.id=i.id WHERE (to_jsonb(p)-'created_at'-'updated_at'-'promo_price')=to_jsonb(i)) <> (SELECT count(*) FROM import_products) THEN RAISE EXCEPTION 'Importação divergente'; END IF;
END $verify$;
COMMIT;
SELECT count(*) AS imported_products FROM products WHERE workspace_id={workspace}::uuid AND import_snapshot->>'sha256'={sql_literal(manifest['sha256'])};
"""


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--default-catalog', required=True)
    parser.add_argument('--output-prefix', required=True)
    args = parser.parse_args()
    manifest = prepare(args.source, args.workspace, args.default_catalog)
    prefix = Path(args.output_prefix)
    prefix.with_suffix('.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    prefix.with_suffix('.sql').write_text(operation(manifest), encoding='utf-8')
    print(json.dumps({'products': len(manifest['products']), 'catalogs': {c['name']: sum(p['catalog_id']==c['id'] for p in manifest['products']) for c in manifest['catalogs']}, 'negative_stock': sum(p['stock']<0 for p in manifest['products']), 'unknown_stock': sum(not p['stock_known'] for p in manifest['products']), 'known_stock_total': sum(p['stock'] for p in manifest['products'] if p['stock_known'])}, ensure_ascii=False))
