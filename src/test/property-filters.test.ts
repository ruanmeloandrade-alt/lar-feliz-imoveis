import { describe, it, expect } from "vitest";
import {
  filterProperties,
  propertyFilterOptions,
  emptyPropertyFilters,
} from "@/lib/property-filters";
import type { Property } from "@/types/property";
const properties = [
  {
    id: "a",
    title: "Casa Sol",
    city: "Campinas",
    neighborhood: "Jardim São José",
    bedrooms: 2,
    bathrooms: 1,
  },
  {
    id: "b",
    title: "Casa Jardim",
    city: "Sumaré",
    neighborhood: "Centro",
    bedrooms: 3,
    bathrooms: 2,
  },
  {
    id: "c",
    title: "Apartamento Centro",
    city: "Campinas",
    address: "Rua Clara, Centro",
    bedrooms: 2,
    bathrooms: null,
  },
  {
    id: "d",
    title: "Casa Central",
    city: "Campinas",
    neighborhood: "Centro",
    bedrooms: 1,
    bathrooms: 1,
  },
] as Property[];
describe("Busca pública de imóveis", () => {
  it("combina cidade, bairro e quantidades cadastradas", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        city: "Campinas",
        neighborhood: "jardim sao jose",
        bedrooms: "2",
        bathrooms: "1",
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
  it("seleciona a quantidade exata sem incluir imóveis maiores", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        bedrooms: "2",
      }).map((p) => p.id),
    ).toEqual(["a", "c"]);
  });
  it("não inventa bairro a partir do endereço ou quantidade desconhecida", () => {
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        neighborhood: "Centro",
      }).map((p) => p.id),
    ).toEqual(["b", "d"]);
    expect(
      filterProperties(properties, {
        ...emptyPropertyFilters,
        bathrooms: "1",
      }).map((p) => p.id),
    ).toEqual(["a", "d"]);
  });
  it("deriva todas as opções somente dos imóveis cadastrados", () => {
    expect(propertyFilterOptions(properties, emptyPropertyFilters)).toEqual({
      cities: ["Campinas", "Sumaré"],
      neighborhoods: ["Centro", "Jardim São José"],
      bedrooms: [1, 2, 3],
      bathrooms: [1, 2],
    });
  });
  it("atualiza as opções conforme cidade, bairro e quartos", () => {
    expect(
      propertyFilterOptions(properties, {
        ...emptyPropertyFilters,
        city: "Sumaré",
      }),
    ).toEqual({
      cities: ["Campinas", "Sumaré"],
      neighborhoods: ["Centro"],
      bedrooms: [3],
      bathrooms: [2],
    });
    expect(
      propertyFilterOptions(properties, {
        ...emptyPropertyFilters,
        city: "Campinas",
        neighborhood: "Centro",
      }).bedrooms,
    ).toEqual([1]);
  });
  it("limpa filtros sem alterar a ordem original", () => {
    expect(filterProperties(properties, emptyPropertyFilters)).toEqual(
      properties,
    );
  });
});
