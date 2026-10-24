export const BRAND = {
  name: "Vanessa Simoni",
  role: "Corretora de Imóveis — Especialista Minha Casa Minha Vida",
  whatsappNumber: "5519992250701",
  whatsappDisplay: "(19) 99225-0701",
  instagram: "https://instagram.com/corretora_vanessasimoni",
  instagramHandle: "@corretora_vanessasimoni",
  cities: ["Campinas", "Sumaré", "Hortolândia", "Paulínia"],
};

export const waUrl = (text: string) =>
  `https://wa.me/${BRAND.whatsappNumber}?text=${encodeURIComponent(text)}`;
