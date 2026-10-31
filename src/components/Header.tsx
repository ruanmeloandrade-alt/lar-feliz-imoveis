import { useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import VanessaBrandLogo from "./VanessaBrandLogo";
import { openVanessaChat } from "@/lib/public-site";
const Header = () => {
  const [open, setOpen] = useState(false);
  const links = [
    ["#imoveis", "Imóveis"],
    ["#como-funciona", "Como funciona"],
    ["#analise", "Pré-análise"],
    ["#faq", "Dúvidas"],
  ];
  return (
    <header className="vs-header">
      <div className="container vs-header-row">
        <a href="#" className="vs-wordmark">
          <VanessaBrandLogo />
        </a>
        <nav aria-label="Navegação principal" className="vs-desktop-nav">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <button
            className="vs-header-contact"
            onClick={() => openVanessaChat()}
          >
            Começar atendimento
            <ArrowUpRight size={15} />
          </button>
        </nav>
        <button
          className="vs-menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="vs-mobile-nav container" aria-label="Navegação mobile">
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              openVanessaChat();
            }}
          >
            Começar atendimento
            <ArrowUpRight size={15} />
          </button>
        </nav>
      )}
    </header>
  );
};
export default Header;
