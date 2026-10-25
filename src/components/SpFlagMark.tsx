import bandeira from "@/assets/bandeira-sp.svg";

interface Props {
  className?: string;
  size?: number;
}

const SpFlagMark = ({ className = "", size = 36 }: Props) => (
  <span
    className={`inline-flex items-center justify-center rounded-md overflow-hidden ring-1 ring-black/10 shadow-sm ${className}`}
    style={{ width: size, height: size * 0.66 }}
    aria-label="Bandeira do Estado de São Paulo"
  >
    <img src={bandeira} alt="" className="w-full h-full object-cover" />
  </span>
);

export default SpFlagMark;
