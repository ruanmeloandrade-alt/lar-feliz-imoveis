import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PropertyInterestForm from "@/components/PropertyInterestForm";
import PropertyDetailDialog from "@/components/PropertyDetailDialog";
const property = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Imóvel de teste",
  city: "Campinas",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('opens a focused compact registration step instead of placing fields after the property description',()=>{
  render(<PropertyDetailDialog property={{...property,address:null,description:'Descrição extensa do empreendimento.',price:null,subsidy_estimate:null,monthly_parcel:null,down_payment:null,show_parcel:false,show_down_payment:false,bedrooms:2,bathrooms:1,area_m2:50,tag:'Enquadrado MRV',images:[],pdfs:[],plans:[],construction_status:'na_planta',launch_date:null,published:true}} onOpenChange={()=>{}}/>);
  expect(screen.queryByText('Enquadrado MRV')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Tenho interesse'}));
  expect(screen.getByLabelText('Nome')).toHaveFocus();
  expect(screen.getByLabelText('WhatsApp com DDD')).toBeVisible();
  expect(screen.queryByText('Descrição extensa do empreendimento.')).toBeNull();
});
function fill() {
  fireEvent.change(screen.getByLabelText("Nome"), {
    target: { value: "Pessoa de Teste" },
  });
  fireEvent.change(screen.getByLabelText("WhatsApp com DDD"), {
    target: { value: "11999999999" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Continuar no WhatsApp" }),
  );
}
it("captures only name and WhatsApp and redirects only after registration succeeds", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "session-token" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ registered: true, leadCreated: true }),
    });
  vi.stubGlobal("fetch", fetcher);
  const navigate = vi.fn();
  const { container } = render(
    <PropertyInterestForm
      property={property}
      onBack={() => {}}
      onContinue={navigate}
    />,
  );
  expect(container.querySelectorAll("input")).toHaveLength(2);
  expect(screen.queryByRole("checkbox")).toBeNull();
  fill();
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    action: "start",
    propertyId: property.id,
  });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
    action: "contact",
    token: "session-token",
    name: "Pessoa de Teste",
    phone: "11999999999",
    consent: true,
  });
  expect(navigate.mock.calls[0][0]).toContain("https://wa.me/");
});
it("keeps the visitor on the form when saving fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "session-token" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Não foi possível salvar." }),
      }),
  );
  const navigate = vi.fn();
  render(
    <PropertyInterestForm
      property={property}
      onBack={() => {}}
      onContinue={navigate}
    />,
  );
  fill();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível salvar.",
  );
  expect(navigate).not.toHaveBeenCalled();
});
