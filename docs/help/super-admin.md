# Super Admin

Super Admin is a restricted console for operators who manage multiple workspaces. It is not part of normal company-user work.

## Platform dashboard

The Super Admin console includes a global platform-health dashboard covering the configured US, UK, and EU data stores. It shows:

- total organizations, active users, registered agents, companies, and contacts;
- organizations currently in a seven-day or three-month trial;
- paid organizations and trial-to-paid conversion dates;
- billing, subscription, License_API status, and license decision;
- organizations that need attention, including pending or unavailable billing states;
- trial end dates and the number of trials currently approaching completion.

Use the billing filter to review all organizations, trial organizations, paid organizations, or organizations needing attention. The dashboard is calculated server-side and can be refreshed when investigating a webhook or license synchronization delay.

Use the workspace selector to choose a company and region, then select **Open workspace**. Confirm the selected organization before viewing or changing CRM data. Return to the console when finished.

Super Admins can create workspaces and manage workspace membership. Treat these actions as administrative changes: verify the organization and invitee email carefully, and grant the smallest appropriate role.

