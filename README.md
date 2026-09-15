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
- `Admin.html` - GitHub Pages admin dashboard frontend.
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
   - Admin: `https://alokraibvm.github.io/School-Fest/Admin.html`
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

## Changes in this copy

- QR codes now contain only the Pass ID (for privacy). New passes will embed only values like `AF-2026-00001` inside the QR. The system still accepts already-issued token-based QR images.
- The `Parent Passes` sheet now records `Email Status` and `WhatsApp Status` for each pass to help track delivery.

## WhatsApp integrations

This project supports sending WhatsApp notifications via Twilio (already included) and can be adapted to the official WhatsApp Business Cloud API. Do NOT hard-code API secrets in client-side code — store them in Apps Script Properties.

To configure Twilio (current implementation):

1. In Apps Script, open `Project Settings > Script properties` and add the following keys, or run `setTwilioConfig(accountSid, authToken, fromWhatsappNumber)` from the script editor:

   - `TWILIO_ACCOUNT_SID` — your Twilio Account SID
   - `TWILIO_AUTH_TOKEN` — your Twilio Auth Token
   - `TWILIO_FROM_WHATSAPP` — the WhatsApp-enabled Twilio number (in international format, e.g. +1415xxxxxxx)
   - `TWILIO_FROM_SMS` — (optional) the Twilio phone number for SMS/MMS (in E.164 format). If not set, `TWILIO_FROM_WHATSAPP` will be used as a fallback where appropriate.

2. Optionally run `verifyTwilioConfig('+91XXXXXXXXXX')` to send a test WhatsApp message.

To use the official WhatsApp Business Cloud API instead:

- You'll need your WhatsApp Business `phone_number_id` and a `Bearer` access token from Meta. Store them in Script Properties (do not commit them).
- Implement a small Apps Script function that calls `https://graph.facebook.com/v17.0/<PHONE_NUMBER_ID>/messages` with the proper payload and Authorization header `Bearer <TOKEN>`.
This repository includes a ready-to-configure WhatsApp Business Cloud API helper.

Configuration keys (Script Properties) or use `setWhatsAppCloudConfig(phoneNumberId, accessToken)`:

- `WHATSAPP_PHONE_NUMBER_ID` — the phone number id from your Meta Business account
- `WHATSAPP_ACCESS_TOKEN` — the bearer access token (store securely)

## SMS via Twilio

This project can also send the Pass ID and QR link via SMS/MMS using Twilio. Configure the Twilio credentials as above and set `TWILIO_FROM_SMS` to a Twilio phone number enabled for SMS. The script will attempt to send an SMS after sending the email and will record `SMS Status` in the `Parent Passes` sheet.

SMS messages are plain text and include the Pass ID and a link to open the digital pass. If you prefer to send the QR image itself as MMS, the script will include the QR image URL as `MediaUrl` when Twilio supports MMS for your number and destination.

After configuring, you can run `verifyWhatsAppCloudConfig(testPhoneNumber)` from the Apps Script editor to send a test message.

Example Cloud API payload sent by the helper (text message):

POST https://graph.facebook.com/v17.0/<PHONE_NUMBER_ID>/messages
Headers:
- Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>
- Content-Type: application/json

Body:

```json
{
   "messaging_product": "whatsapp",
   "to": "9198xxxxxxx",
   "type": "text",
   "text": { "body": "Your pass AF-2026-00001 is ready" }
}
```
