/**
 * Hero product visual.
 *
 * This is the single slot for the product picture beside the hero. Today it
 * renders an illustrative HTML/CSS mock of the Contacts page with invented
 * demo data. To swap in a real screenshot later, set PRODUCT_SCREENSHOT to an
 * image in /public (demo workspace only, never customer data); nothing else
 * on the page needs to change.
 */
export const PRODUCT_SCREENSHOT: { src: string; alt: string; width: number; height: number } | null = null;

const demoContacts = [
  { initials: "AS", name: "Avery Sample", company: "Acme Demo Co", segment: "Follow-up", last: "Email logged · 2h" },
  { initials: "JP", name: "Jordan Placeholder", company: "Example Bakery", segment: "New leads", last: "Site visit · 1d" },
  { initials: "RT", name: "Riley Testcase", company: "Demo Plumbing", segment: "Follow-up", last: "Note added · 2d" },
  { initials: "SF", name: "Sam Fictional", company: "Sample Studio", segment: "Customers", last: "Campaign · 4d" }
];

function renderMock(): string {
  const rows = demoContacts
    .map(
      (contact, index) => `
        <li class="mock-row${index === 0 ? " is-selected" : ""}">
          <span class="mock-avatar">${contact.initials}</span>
          <span class="mock-person"><b>${contact.name}</b><small>${contact.company}</small></span>
          <span class="mock-chip">${contact.segment}</span>
          <span class="mock-last">${contact.last}</span>
        </li>`
    )
    .join("");

  return `
    <figure class="product-visual" data-product-visual="mock">
      <div class="mock-window" role="img" aria-label="Illustrative example of the Loop Contacts page, showing invented demo contacts and one contact's activity timeline.">
        <div class="mock-bar" aria-hidden="true">
          <span class="mock-dots"><i></i><i></i><i></i></span>
          <span class="mock-workspace">Acme Demo Co</span>
        </div>
        <div class="mock-body" aria-hidden="true">
          <nav class="mock-side">
            <span class="is-active">Contacts</span>
            <span>Companies</span>
            <span>Segments</span>
            <span>Campaigns</span>
          </nav>
          <div class="mock-main">
            <div class="mock-head">
              <strong>Contacts</strong>
              <span class="mock-search">Search contacts</span>
            </div>
            <ul class="mock-list">${rows}</ul>
            <div class="mock-timeline">
              <strong>Avery Sample · Timeline</strong>
              <ol>
                <li><i></i><span>Email logged by BCC<small>Re: Spring order · 2h ago</small></span></li>
                <li><i></i><span>Added to segment<small>Follow-up · yesterday</small></span></li>
                <li><i></i><span>Contact created<small>From CSV upload · last week</small></span></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      <figcaption class="product-visual-caption">Illustrative example. Names and companies are invented.</figcaption>
    </figure>`;
}

export function renderProductVisual(): string {
  if (PRODUCT_SCREENSHOT) {
    const shot = PRODUCT_SCREENSHOT;
    return `
      <figure class="product-visual" data-product-visual="screenshot">
        <img class="product-screenshot" src="${shot.src}" alt="${shot.alt}" width="${shot.width}" height="${shot.height}" />
      </figure>`;
  }
  return renderMock();
}
