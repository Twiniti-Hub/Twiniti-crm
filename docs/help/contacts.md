# Contacts and Kanban boards

## Find a contact

Open **Contacts**. Kanban is the default view and groups contacts by lifecycle stage. Use the board search to filter cards. Switch to **List** (`?view=list`) for the tabular browser, or open a card to see the contact detail page with custom fields, notes and activity, and grouped change history.

## Add or edit a contact

Choose **New contact**, enter the available identity fields, then save. Imported personal contacts can have a name or phone without an email. Contacts without an email cannot receive campaigns. From a contact detail page choose the edit controls to change core fields or grouped custom fields. If another user edits the same record first, reload and resolve the reported version conflict before saving again.

## Connect Google or iCloud contacts

In a personal workspace, open **Settings → Connected accounts**. Choose **Connect Google Contacts** and grant read-only contact access, or connect iCloud with your Apple Account email and an app-specific password. Never enter your normal Apple Account password into Loop.

Loop prepares a preview before importing. Choose **Import contacts** after reviewing the connection. Connected accounts refresh about every 30 minutes; **Sync now** requests an earlier refresh. Sync is inbound only, so Loop does not change Google or iCloud.

Loop keeps provider identity mappings separately from email addresses. Ambiguous matches wait for review rather than being silently merged. Local notes and history are retained. Disconnecting removes stored provider credentials and stops updates while retaining imported contacts.

On the contact detail page, use **Add note** to capture call outcomes or context without sending email. Notes appear immediately in the activity timeline. BCC-tracked emails appear as separate **Email** activity cards (one per message) with subject and an **Open email** viewer for the message body. Field changes are grouped by save into a short change history; expand a row to see field-level diffs, and choose **Show more** when you need older changes.

On the Kanban board, drag a card between lanes or use **Move to…** on the card. Moves update the lifecycle stage immediately with optimistic concurrency. The **Other** lane holds unknown imported values and is not a drop target.

## Manage custom properties

The property manager on the Contacts page lets admins create, search, edit, and group tenant-specific fields. Give each property a readable label and a stable internal name. Choose the data type and, where applicable, define allowed options.

Deleting a property is destructive to the current contact values. Review the impact report before confirming. Historical property-change records are retained, but the property key is removed from organization contacts. Impact counts also include board views that reference the field.

## Archive records

Archive a contact when it should no longer be active but its history must remain available. Archived records are excluded from normal active work without erasing their history.
## Website visits

When WV App Web Visitors is enabled, a safely resolved person has a **Web Visitors** summary on the contact profile. It shows the unique visit count and first/last visit dates. Each accepted visit appears on the contact timeline with the captured page, referral information when supplied, and the provider's date/time precision.

Loop attributes one visit to one primary CRM record. A contact-level visit is not also counted on the company. Duplicate webhook deliveries do not increase the count.
