import { describe, it, expect } from "vitest";
import { filterProperties, emptyPropertyFilters } from "@/lib/property-filters";
import type { Property } from "@/types/property";
const properties = [
  {
    id: "a",
    title: "Casa Sol",
    city: "Campinas",
    neighborhood: "Jardim São José",
    bedrooms: 2,
    bathrooms: 1,
    kitchens: 1,
    living_rooms: 2,
  },
  {
    id: "b",
    title: "Casa Jardim",
    city: "Sumaré",
    bedrooms: 3,
    bathrooms: 2,
    kitchens: 2,
    living_rooms: 1,
  },
  {
    id: "c",
    title: "Apartamento Centro",
    city: "Campinas",
    address: "Rua Clara, Centro",
    bedrooms: 2,
    bathrooms: 1,
    kitchens: null,
    living_rooms: null,
  },
] as Property[];
describe("Busca pública de imóveis", () => {
  it("combina cidade, bairro e todos os cômodos sem ignorar critérios", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        city: "Campinas",
        neighborhood: "sao jose",
        bedrooms: "2",
        bathrooms: "1",
        kitchens: "1",
        living_rooms: "2",
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });
  it("pesquisa palavras combinadas sem diferenciar acentos", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        query: "casa sumare",
      }).map((p) => p.id),
    ).toEqual(["b"]);
  });
  it("não inventa quantidade de cozinhas ou salas quando o cadastro não informa", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        kitchens: "1",
      }).map((p) => p.id),
    ).toEqual(["a", "b"]);
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        living_rooms: "2",
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });
  it("busca bairro no endereço público e limpa filtros sem alterar a ordem", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        neighborhood: "centro",
      }).map((p) => p.id),
    ).toEqual(["c"]);
    expect(filterProperties(properties, emptyPropertyFilters)).toEqual(
      properties,
    );
  });
  it("retorna vazio para combinações incompatíveis", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        city: "Campinas",
        bathrooms: "2",
      }),
    ).toEqual([]);
  });
});
