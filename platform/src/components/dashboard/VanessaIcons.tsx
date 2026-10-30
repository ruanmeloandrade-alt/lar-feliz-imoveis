import type { SVGProps } from "react";
export type VanessaIconProps = SVGProps<SVGSVGElement> & { size?: number | string };
function icon(name: string, path: string) {
  return function VanessaIcon({ size = 20, ...props }: VanessaIconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-vanessa-icon={name}
        {...props}
      >
        <path d={path} />
      </svg>
    );
  };
}
export const VanessaIcons = {
  home: icon("home", "M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10M9 7h6"),
  history: icon("history", "M5 4h14v16H5zM8 8h8M8 12h5M14 16h2M2 7h3M2 11h3"),
  dashboard: icon("dashboard", "M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z"),
  estate: icon("estate", "M2 21h20M4 21V9l8-6 8 6v12M8 21V11h8v10M11 7h2"),
  orders: icon("orders", "M4 3h11l5 5v13H4zM14 3v6h6M8 13h8M8 17h5"),
  suppliers: icon("suppliers", "M3 21V8h8v13M11 21V3h10v18M6 11h2M6 15h2M14 7h4M14 11h4M14 15h4"),
  products: icon("products", "M3 12 12 4l9 8M6 10v10h12V10M10 20v-6h4v6M2 21h20"),
  crm: icon("crm", "M4 5h16v14H4zM8 9h8M8 13h3M15 16l3-3 3 3"),
  funnel: icon("funnel", "M3 4h18l-7 9v7l-4-2v-5zM7 8h10"),
  clients: icon(
    "clients",
    "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a6 6 0 0 1 12 0v3M17 4a4 4 0 0 1 0 8M18 15a5 5 0 0 1 4 5",
  ),
  inbox: icon("inbox", "M3 4h18v13H9l-6 4zM7 8h10M7 12h7"),
  automation: icon(
    "automation",
    "M12 3v5M5 9h14v10H5zM8 13h1M15 13h1M9 16h6M2 12h3M19 12h3M10 3h4",
  ),
  brain: icon(
    "brain",
    "M12 5C6 0 1 8 5 12c-5 5 2 12 7 7 5 5 12-2 7-7 4-4-1-12-7-7zM12 5v14M6 9l6 3 6-3M6 16l6-4 6 4",
  ),
  audience: icon(
    "audience",
    "M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M7 18v-3a5 5 0 0 1 10 0v3M3 11a2 2 0 1 0 0-4M21 11a2 2 0 1 1 0-4M1 21v-5h3M23 21v-5h-3",
  ),
  settings: icon("settings", "M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 6h6"),
  general: icon("general", "M4 4h16v16H4zM8 8h2v2H8zM14 8h2M8 14h8M8 17h5"),
  integrations: icon("integrations", "M8 3v5M16 3v5M5 8h14v4a7 7 0 0 1-7 7v3M8 12h8"),
  tutorial: icon("tutorial", "M4 3h16v18H4zM9 8l7 4-7 4zM7 3v18"),
  tracking: icon("tracking", "M3 19 8 12l5 3 8-11M16 4h5v5M3 22h18"),
  origins: icon("origins", "M4 4h5v5H4zM15 15h5v5h-5zM7 9v8h8M9 7h8v8"),
};
