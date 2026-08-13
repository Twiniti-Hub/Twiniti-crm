# Contacts and Kanban boards

## Find a contact

Open **Contacts**. Kanban is the default view and groups contacts by lifecycle stage. Use the board search to filter cards. Switch to **List** (`?view=list`) for the tabular browser, or open a card to see the contact detail page with custom fields, email activity, and change history.

## Add or edit a contact

Choose **New contact**, enter the email and available identity fields, then save. From a contact detail page choose the edit controls to change core fields or grouped custom fields. If another user edits the same record first, reload and resolve the reported version conflict before saving again.

On the Kanban board, drag a card between lanes or use **Move to…** on the card. Moves update the lifecycle stage immediately with optimistic concurrency. The **Other** lane holds unknown imported values and is not a drop target.

## Manage custom properties

The property manager on the Contacts page lets admins create, search, edit, and group tenant-specific fields. Give each property a readable label and a stable internal name. Choose the data type and, where applicable, define allowed options.

Deleting a property is destructive to the current contact values. Review the impact report before confirming. Historical property-change records are retained, but the property key is removed from organization contacts. Impact counts also include board views that reference the field.

## Archive records

Archive a contact when it should no longer be active but its history must remain available. Archived records are excluded from normal active work without erasing their history.
