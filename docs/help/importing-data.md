# Importing CSV files

Open **Import**. Loop supports separate contact and company CSV uploads.

## Import contacts

Choose a CSV file and review the detected row count and headers. Loop identifies standard contact and identity columns. Any remaining columns become tenant custom properties automatically when needed. Select **Import contacts** to start the background job.

## Import companies

Choose a company CSV and confirm the detected headers. Supported company columns include `Company name`, `Industry`, `Company owner`, `Create Date`, `Phone Number`, `Last Activity Date`, `City`, and `Country/Region`. Select **Import companies**.

## Monitor a job

The page shows the active job, recent import history, status, counts, and failed rows. Select a history entry to inspect its summary and errors. Imports are processed in the background, so you may leave the page and return later.

Use one header row, keep headers unique, and preserve email addresses in a consistent format. Correct failed rows in the source file and import them again rather than repeatedly retrying malformed data.

