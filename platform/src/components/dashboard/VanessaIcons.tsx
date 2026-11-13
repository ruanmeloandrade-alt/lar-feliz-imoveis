import type { SVGProps } from "react";
export type VanessaIconProps = SVGProps<SVGSVGElement> & { size?: number | string };
function icon(name: string, path: string, detail?: string) {
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
        {detail && <path d={detail} fill="currentColor" stroke="none" />}
      </svg>
    );
  };
}
export const VanessaIcons = {
  home: icon(
    "home",
    "M2.5 10.5 12 3l9.5 7.5M5 9v9.5L12 22l7-3.5V9M8 12l4 5 4-5M12 17v5",
    "M12 7.5 13.4 9 12 10.5 10.6 9Z",
  ),
  history: icon("history", "M5 4h14v16H5zM8 8h8M8 12h5M14 16h2M2 7h3M2 11h3"),
  dashboard: icon("dashboard", "M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z"),
  estate: icon(
    "estate",
    "M2.5 18.5 7.5 21l14-7M3 15.5v-6l4-2 4 2M7 17.5V12l4-2V5l5-2.5L21 5v8l-5 2.5-5-2.5M16 2.5v13M7 17.5l4-2",
    "M17.6 7.2 19.4 6.3v2.1l-1.8.9Zm0 3.2 1.8-.9v2.1l-1.8.9Z",
  ),
  orders: icon("orders", "M4 3h11l5 5v13H4zM14 3v6h6M8 13h8M8 17h5"),
  suppliers: icon("suppliers", "M3 21V8h8v13M11 21V3h10v18M6 11h2M6 15h2M14 7h4M14 11h4M14 15h4"),
  products: icon("products", "M3 12 12 4l9 8M6 10v10h12V10M10 20v-6h4v6M2 21h20"),
  crm: icon(
    "crm",
    "M3 5.5 8.5 3l5.5 2.5v6l-5.5 2.7L3 11.5zM10.5 16.5v2l5.2 2.5 5.3-2.5v-6l-4-1.9M5.5 11c.6-1.2 1.6-1.8 3-1.8s2.4.6 3 1.8M15.7 17l2.7-2.7",
    "M8.5 5.4a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z",
  ),
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
  settings: icon(
    "settings",
    "m12 2.7 8.3 4.7v9.2L12 21.3l-8.3-4.7V7.4zM12 6.8l4.5 2.6v5.2L12 17.2l-4.5-2.6V9.4zM12 2.7v4.1m8.3.6-3.8 2m-9 5.2-3.8 2m8.3.6v4.1",
    "M12 9.9 13.8 12 12 14.1 10.2 12Z",
  ),
  general: icon("general", "M4 4h16v16H4zM8 8h2v2H8zM14 8h2M8 14h8M8 17h5"),
  integrations: icon("integrations", "M8 3v5M16 3v5M5 8h14v4a7 7 0 0 1-7 7v3M8 12h8"),
  tutorial: icon("tutorial", "M4 3h16v18H4zM9 8l7 4-7 4zM7 3v18"),
  tracking: icon(
    "tracking",
    "M12 20.5C7.8 16.2 5.5 13.1 5.5 9.6a6.5 6.5 0 0 1 13 0c0 3.5-2.3 6.6-6.5 10.9ZM3 14.8l-1 4 6 3.2 4-1.5 4 1.5 6-3.2-1-4M8 9.6h1.4m5.2 0H16",
    "M12 7.4 14.1 9.6 12 11.8 9.9 9.6Z",
  ),
  origins: icon("origins", "M4 4h5v5H4zM15 15h5v5h-5zM7 9v8h8M9 7h8v8"),
};
