import { countryCodeOptions } from "@twiniti/contracts";

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export function CountrySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">Select your country</option>
      {countryCodeOptions.map((code) => (
        <option key={code} value={code}>
          {displayNames.of(code) ?? code}
        </option>
      ))}
    </select>
  );
}
