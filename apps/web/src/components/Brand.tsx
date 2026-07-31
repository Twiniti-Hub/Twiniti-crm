import { Link } from "react-router";

type BrandProps = {
  link?: boolean;
};

function BrandContent() {
  return (
    <>
      <img className="brand-logo" src="/twiniti-loop-icon-light.png" alt="" aria-hidden="true" />
      <span>Twiniti Loop</span>
    </>
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
