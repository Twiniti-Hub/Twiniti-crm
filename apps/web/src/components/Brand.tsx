import { Link } from "react-router";

type BrandProps = {
  link?: boolean;
};

function BrandContent() {
  return (
    <span className="brand-loop-logo" aria-hidden="true">
      <img
        className="brand-loop-logo-image brand-loop-logo-light"
        src="/branding/loop-logo-light.png"
        alt=""
      />
      <img
        className="brand-loop-logo-image brand-loop-logo-dark"
        src="/branding/loop-logo-dark.png"
        alt=""
      />
    </span>
  );
}

export function Brand({ link = false }: BrandProps) {
  if (link) {
    return (
      <Link to="/" className="brand" aria-label="Twiniti Loop home">
        <BrandContent />
      </Link>
    );
  }

  return (
    <div className="brand" aria-label="Twiniti Loop">
      <BrandContent />
    </div>
  );
}
