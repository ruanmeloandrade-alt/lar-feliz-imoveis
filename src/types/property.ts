export type PropertyPlan = {
  name: string;
  area_m2: number | null;
};

export type ConstructionStatus = "na_planta" | "pronto";

export type Property = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  neighborhood?: string | null;
  kitchens?: number | null;
  living_rooms?: number | null;
  description: string | null;
  price: number | null;
  subsidy_estimate: number | null;
  monthly_parcel: number | null;
  down_payment: number | null;
  show_parcel: boolean;
  show_down_payment: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  tag: string | null;
  images: string[];
  pdfs: string[];
  plans: PropertyPlan[];
  construction_status: ConstructionStatus;
  launch_date: string | null;
  published: boolean;
};
