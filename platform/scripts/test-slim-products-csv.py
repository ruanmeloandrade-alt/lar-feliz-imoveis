import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('import-slim-products-csv.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
WS = 'c49945db-1960-461a-9339-a43b8403bdd9'
CAT = 'e62a4920-937a-422a-8aa6-5aba1badb539'


class ImportTests(unittest.TestCase):
    def prepare(self, overrides=None, duplicate=False):
        row = dict(zip(mod.HEADERS, ['', 'Produto sintético', '', 'unidade', '-5', '0', '146,25', '1.050', '0', '0', '734.033,96', '1.044', '106.833,968']))
        row.update(overrides or {})
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic.csv'
            with source.open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=mod.HEADERS)
                writer.writeheader()
                writer.writerow(row)
                if duplicate: writer.writerow(row)
            return mod.prepare(source, WS, CAT)

    def test_decimal_and_complete_history(self):
        result = self.prepare()['products'][0]
        self.assertEqual(result['price'], '1050')
        self.assertEqual(result['cost_price'], '146.25')
        self.assertEqual(result['stock'], -5)
        self.assertTrue(result['stock_known'])
        self.assertEqual(len(result['import_snapshot']['raw']), 13)
        self.assertEqual(result['import_snapshot']['numbers']['Lucro'], '106833.968')
        self.assertEqual(result['import_snapshot']['numbers']['Quantidade vendida'], '1044')

    def test_unknown_and_explicit_zero(self):
        result = self.prepare({'Estoque Atual': '', 'Estoque Minimo': '', 'Preço de Venda': '0'})['products'][0]
        self.assertFalse(result['stock_known'])
        self.assertIsNone(result['minimum_stock'])
        self.assertIsNone(result['import_snapshot']['numbers']['Estoque Atual'])
        self.assertEqual(result['price'], '0')

    def test_deterministic(self):
        self.assertEqual(self.prepare(), self.prepare())

    def test_invalid(self):
        for field, value in [('Estoque Atual', '1,5'), ('Estoque Minimo', '-1'), ('Preço de Venda', '-1'), ('Preço de Custo', 'NaN'), ('Preço de Venda', '1,001')]:
            with self.assertRaises(ValueError): self.prepare({field: value})
        with self.assertRaises(ValueError): self.prepare(duplicate=True)


if __name__ == '__main__': unittest.main()
