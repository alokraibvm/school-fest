# Parent Verification System for School Annual Fest

This project is a complete Google Apps Script based parent verification system. It uses Google Forms for registration, Google Sheets for storage, QR passes by email, a mobile scanner page, attendance marking, duplicate scan prevention, and an admin dashboard.

## Files

- `Code.gs` - Apps Script backend.
- `Scanner.html` - mobile-friendly QR scanner page.
- `Admin.html` - admin dashboard page.
- `Styles.html` - shared responsive CSS.
- `JavaScript.html` - shared frontend JavaScript.
- `appsscript.json` - Apps Script manifest.
- `index.html` - GitHub Pages scanner frontend with direct camera support.
- `admin.html` - GitHub Pages admin dashboard frontend.
- `styles.css` - GitHub Pages styling.
- `app.js` - GitHub Pages frontend logic.

## Google Form Fields

Create a Google Form with these recommended questions:

- Parent Name
- Email Address
- Phone Number
- Student Name
- Class/Section
- Relation

The script also recognizes common alternate names like `Guardian Name`, `Mobile Number`, `Child Name`, `Grade`, and `Relationship`.

## Setup

1. Create or open the Google Sheet that will store responses.
2. Go to `Extensions > Apps Script`.
3. Add these project files in Apps Script with the same names.
4. If you need the script to create the form, run `createRegistrationForm()` once and approve permissions. It returns the form edit URL and public registration URL.
5. If you already have a Google Form, link it to this Sheet from `Responses`, then run `setupSystem()` once.
6. Deploy as a web app:
   - Execute as: `Me`
   - Who has access: choose your school/domain users, or anyone with the link if gate scanners are outside the domain.
7. Copy the web app URL.
8. For direct mobile camera support, enable GitHub Pages for this repository and use:
   - Scanner: `https://alokraibvm.github.io/School-Fest/`
   - Admin: `https://alokraibvm.github.io/School-Fest/admin.html`
9. In Apps Script, run this once if your GitHub Pages URL is different:

```js
setGithubPagesUrl('https://alokraibvm.github.io/School-Fest/')
```

10. New QR passes will open the GitHub Pages scanner. Existing passes still open the URL stored when they were created.

## How It Works

When a parent submits the Google Form, the linked Sheet saves the response. The installable `onFormSubmit` trigger creates a unique Pass ID, signs it into a QR token, generates a QR image URL, stores everything in `Parent Passes`, and emails the QR pass to the parent.

At the gate, staff open the GitHub Pages scanner on a phone, tap `Start camera`, scan the QR, verify details, and tap `Mark entry`. The scanner also supports taking/uploading a QR photo and manual Pass ID entry. The system updates `Parent Passes`, appends an `Attendance` row, and blocks repeat entry attempts by logging them in `Duplicate Scans`.

The admin dashboard shows total registrations, completed entries, pending parents, duplicate registrations, and duplicate scans.

## Duplicate Rules

The system treats a new registration as duplicate when:

- The email already has a registered pass, or
- The same phone number is submitted for the same student name.

The system treats a scan as duplicate when:

- A valid pass has already been marked as entered.

## Notes

- QR images are generated through `quickchart.io`.
- The QR token is signed with a script-level secret stored in Apps Script Properties.
- Keep the Apps Script project bound to the response spreadsheet.
- If your form uses different question names, update the aliases in `normalizeParent_()` inside `Code.gs`.
