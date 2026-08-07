# Companies

Open **Companies** to create, search, and browse company records. A company requires a name; domain and industry are optional.

Use the search field for a company name or domain, select **Apply filter**, and use **Clear** to return to the full list. Change the page-size selector when reviewing larger workspaces. Select a company name to view its detail page and associated contacts.

When importing contacts, a company name can be matched to an existing company. If no match exists, Loop creates the company and stores the relationship as a contact-to-company association.

Company records can also be managed by scoped MCP agents. The `companies:read`
scope permits search and retrieval; `companies:create` permits creation; and
`companies:update` permits edits. An integration such as Lexi Lite should search
the authenticated workspace before creating a new company, then retain the
returned company ID. Company writes are organization-scoped and updates support
the `version` field for optimistic concurrency.

