const CONFIG = {
  FORM_RESPONSE_SHEET: 'Form Responses 1',
  PASS_SHEET: 'Parent Passes',
  ATTENDANCE_SHEET: 'Attendance',
  DUPLICATE_SCAN_SHEET: 'Duplicate Scans',
  SCHOOL_NAME: 'School Annual Fest',
  EVENT_NAME: 'Annual Fest Parent Entry Pass',
  PASS_PREFIX: 'AF',
  TIMEZONE: 'Asia/Kolkata',
  DEFAULT_COUNTRY_CODE: '91',
  GITHUB_PAGES_URL: 'https://alokraibvm.github.io/School-Fest/'
};

const PASS_HEADERS = [
  'Timestamp',
  'Pass ID',
  'QR Token',
  'QR Image URL',
  'Parent Name',
  'Email',
  'Phone',
  'WhatsApp Number',
  'Student Name',
  'Class',
  'Relation',
  'Registration Status',
  'Entry Status',
  'Entry Time',
  'Duplicate Reason',
  'Source Response Row'
  , 'Email Status', 'WhatsApp Status', 'SMS Status'
];

const ATTENDANCE_HEADERS = [
  'Entry Time',
  'Pass ID',
  'Parent Name',
  'Email',
  'Phone',
  'Student Name',
  'Class',
  'Relation',
  'Scanned By'
];

const DUPLICATE_HEADERS = [
  'Scan Time',
  'Pass ID',
  'Parent Name',
  'Email',
  'Student Name',
  'Previous Entry Time',
  'Scanned By',
  'Reason'
];

function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e);
  }

  const page = String((e && e.parameter && e.parameter.page) || 'scanner').toLowerCase();
  const file = page === 'admin' ? 'Admin' : 'Scanner';
  const template = HtmlService.createTemplateFromFile(file);
  template.appUrl = ScriptApp.getService().getUrl();
  template.schoolName = CONFIG.SCHOOL_NAME;
  template.eventName = CONFIG.EVENT_NAME;

  return template.evaluate()
    .setTitle(page === 'admin' ? 'Parent Verification Admin' : 'Parent QR Scanner')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function handleApiRequest_(e) {
  const params = e.parameter || {};
  const action = String(params.action || '').toLowerCase();
  let result;

  try {
    if (action === 'verify') {
      result = verifyPassForPreview(params.code || params.token || params.passId || '');
    } else if (action === 'mark') {
      result = markAttendance(params.code || params.token || params.passId || '');
    } else if (action === 'dashboard') {
      result = getDashboardData();
    } else if (action === 'config') {
      result = {
        ok: true,
        schoolName: CONFIG.SCHOOL_NAME,
        eventName: CONFIG.EVENT_NAME,
        githubPagesUrl: getFrontendBaseUrl_(),
        webAppUrl: ScriptApp.getService().getUrl()
      };
    } else {
      result = { ok: false, status: 'unknown_action', message: 'Unknown API action.' };
    }
  } catch (err) {
    result = { ok: false, status: 'server_error', message: err.message || String(err) };
  }

  return jsonp_(params.callback, result);
}

function jsonp_(callback, data) {
  const safeCallback = String(callback || 'callback').replace(/[^\w.$]/g, '');
  const output = `${safeCallback}(${JSON.stringify(data)});`;
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function setGithubPagesUrl(url) {
  const cleanUrl = normalizeUrl_(url);
  if (!cleanUrl) {
    throw new Error('Enter your GitHub Pages URL.');
  }
  PropertiesService.getScriptProperties().setProperty('GITHUB_PAGES_URL', cleanUrl);
  return {
    ok: true,
    githubPagesUrl: cleanUrl,
    message: 'New QR passes will point to this GitHub Pages scanner URL.'
  };
}

function setTwilioConfig(accountSid, authToken, fromWhatsappNumber) {
  if (!accountSid || !authToken || !fromWhatsappNumber) {
    throw new Error('Provide Twilio account SID, auth token, and the WhatsApp from number.');
  }
  PropertiesService.getScriptProperties().setProperties({
    TWILIO_ACCOUNT_SID: String(accountSid).trim(),
    TWILIO_AUTH_TOKEN: String(authToken).trim(),
    TWILIO_FROM_WHATSAPP: String(fromWhatsappNumber).trim()
  });
  return { ok: true, message: 'Twilio WhatsApp configuration saved.' };
}

function getTwilioConfig_() {
  return {
    accountSid: PropertiesService.getScriptProperties().getProperty('TWILIO_ACCOUNT_SID') || '',
    authToken: PropertiesService.getScriptProperties().getProperty('TWILIO_AUTH_TOKEN') || '',
    fromNumber: PropertiesService.getScriptProperties().getProperty('TWILIO_FROM_WHATSAPP') || '',
    fromSms: PropertiesService.getScriptProperties().getProperty('TWILIO_FROM_SMS') || PropertiesService.getScriptProperties().getProperty('TWILIO_FROM_WHATSAPP') || ''
  };
}

function isTwilioConfigured_() {
  const config = getTwilioConfig_();
  return Boolean(config.accountSid && config.authToken && config.fromNumber);
}

function verifyTwilioConfig(testPhoneNumber) {
  const config = getTwilioConfig_();
  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    return {
      ok: false,
      message: 'Twilio config is incomplete. Run setTwilioConfig() with account SID, auth token, and WhatsApp sender number.'
    };
  }

  if (!testPhoneNumber) {
    return {
      ok: true,
      message: 'Twilio config is valid. Provide a phone number to send a test WhatsApp message if you want.',
      config: {
        from: config.fromNumber,
        accountSid: config.accountSid ? 'configured' : 'missing',
        authToken: config.authToken ? 'configured' : 'missing'
      }
    };
  }

  const testMessage = `Twilio WhatsApp configuration is working for ${CONFIG.SCHOOL_NAME}.`;
  const result = sendWhatsAppMessage_(testPhoneNumber, testMessage, '', config);
  return {
    ok: true,
    message: 'Test WhatsApp message sent successfully.',
    result
  };
}

function setWhatsAppCloudConfig(phoneNumberId, accessToken) {
  if (!phoneNumberId || !accessToken) {
    throw new Error('Provide WhatsApp phone number id and access token.');
  }
  PropertiesService.getScriptProperties().setProperties({
    WHATSAPP_PHONE_NUMBER_ID: String(phoneNumberId).trim(),
    WHATSAPP_ACCESS_TOKEN: String(accessToken).trim()
  });
  return { ok: true, message: 'WhatsApp Cloud configuration saved.' };
}

function getWhatsAppCloudConfig_() {
  return {
    phoneNumberId: PropertiesService.getScriptProperties().getProperty('WHATSAPP_PHONE_NUMBER_ID') || '',
    accessToken: PropertiesService.getScriptProperties().getProperty('WHATSAPP_ACCESS_TOKEN') || ''
  };
}

function isWhatsAppCloudConfigured_() {
  const cfg = getWhatsAppCloudConfig_();
  return Boolean(cfg.phoneNumberId && cfg.accessToken);
}

function verifyWhatsAppCloudConfig(testPhoneNumber) {
  const cfg = getWhatsAppCloudConfig_();
  if (!cfg.phoneNumberId || !cfg.accessToken) {
    return { ok: false, message: 'WhatsApp Cloud config is incomplete. Run setWhatsAppCloudConfig() with phoneNumberId and accessToken.' };
  }
  if (!testPhoneNumber) {
    return { ok: true, message: 'WhatsApp Cloud config looks set. Provide a phone number to send a test message if you want.' };
  }
  const msg = `WhatsApp Cloud configuration test for ${CONFIG.SCHOOL_NAME}.`;
  const result = sendWhatsAppCloudMessage_(testPhoneNumber, msg, '', cfg);
  return { ok: true, message: 'Test message sent', result };
}

function sendWhatsAppCloudMessage_(rawNumber, body, mediaUrl, config) {
  const cfg = config || getWhatsAppCloudConfig_();
  if (!cfg.phoneNumberId || !cfg.accessToken) {
    throw new Error('WhatsApp Cloud config is missing');
  }
  const phone = formatWhatsappPhone_(rawNumber);
  if (!phone) throw new Error('Invalid WhatsApp number');

  const endpoint = `https://graph.facebook.com/v17.0/${cfg.phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${cfg.accessToken}`,
    'Content-Type': 'application/json'
  };

  let payload;
  if (mediaUrl) {
    payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'image',
      image: { link: mediaUrl, caption: body }
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: body }
    };
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: headers,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(endpoint, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let data;
  try { data = JSON.parse(text); } catch (err) { throw new Error('WhatsApp Cloud API returned non-JSON response: ' + text); }
  if (status < 200 || status >= 300) {
    throw new Error(`WhatsApp Cloud send failed: ${data.error ? data.error.message : text}`);
  }
  return data;
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, CONFIG.PASS_SHEET, PASS_HEADERS);
  ensureSheet_(ss, CONFIG.ATTENDANCE_SHEET, ATTENDANCE_HEADERS);
  ensureSheet_(ss, CONFIG.DUPLICATE_SCAN_SHEET, DUPLICATE_HEADERS);
  ensureSecret_();
  installFormSubmitTrigger_();
  return {
    ok: true,
    spreadsheetUrl: ss.getUrl(),
    webAppUrl: ScriptApp.getService().getUrl(),
    message: 'System sheets and form submit trigger are ready.'
  };
}

function createRegistrationForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = FormApp.create(`${CONFIG.SCHOOL_NAME} Parent Registration`);
  form.setDescription(`Register for ${CONFIG.EVENT_NAME}. Each approved registration receives one QR entry pass by email.`);
  form.setCollectEmail(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  form.addTextItem().setTitle('Parent Name').setRequired(true);
  form.addTextItem().setTitle('Email Address').setRequired(true);
  form.addTextItem().setTitle('Phone Number').setRequired(true);
  form.addTextItem().setTitle('WhatsApp Number');
  form.addTextItem().setTitle('Student Name').setRequired(true);
  form.addTextItem().setTitle('Class/Section').setRequired(true);
  form.addListItem()
    .setTitle('Relation')
    .setChoiceValues(['Father', 'Mother', 'Guardian'])
    .setRequired(true);

  setupSystem();
  return {
    ok: true,
    editUrl: form.getEditUrl(),
    publishedUrl: form.getPublishedUrl(),
    spreadsheetUrl: ss.getUrl()
  };
}

function installFormSubmitTrigger_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'onFormSubmit'
  );
  if (!existing) {
    ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  }
}

function onFormSubmit(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, CONFIG.PASS_SHEET, PASS_HEADERS);
  ensureSheet_(ss, CONFIG.ATTENDANCE_SHEET, ATTENDANCE_HEADERS);
  ensureSheet_(ss, CONFIG.DUPLICATE_SCAN_SHEET, DUPLICATE_HEADERS);

  const valuesByHeader = getSubmittedValues_(e);
  const parent = normalizeParent_(valuesByHeader);
  if (!parent.email) {
    throw new Error('Parent email is required to send the QR pass.');
  }

  const passSheet = ss.getSheetByName(CONFIG.PASS_SHEET);
  const records = getPassRecords_();
  const duplicate = findDuplicateRegistration_(records, parent);
  const sourceRow = e && e.range ? e.range.getRow() : '';

  if (duplicate) {
    const duplicateRow = [
      new Date(),
      duplicate.passId,
      '',
      '',
      parent.parentName,
      parent.email,
      parent.phone,
      parent.whatsappNumber,
      parent.studentName,
      parent.className,
      parent.relation,
      'Duplicate',
      'Not Entered',
      '',
      `Duplicate of ${duplicate.passId}`,
      sourceRow,
      '', '', ''
    ];
    passSheet.appendRow(duplicateRow);
    const newRow = passSheet.getLastRow();
    let emailStatus = 'Not Sent';
    let whatsappStatus = 'Not Sent';
    let smsStatus = 'Not Sent';
    try {
      sendDuplicateRegistrationEmail_(parent, duplicate.passId);
      emailStatus = 'Sent';
    } catch (err) {
      emailStatus = 'Failed: ' + (err.message || String(err));
    }
    // Attempt SMS for duplicate notification if phone present and Twilio configured
    try {
      const config = getTwilioConfig_();
      if (parent.phone && config.accountSid && config.authToken && config.fromSms) {
        const smsResult = sendSmsViaTwilio_(parent.phone, `Duplicate registration: existing pass ${duplicate.passId}`, '', config);
        smsStatus = smsResult.sid ? 'Sent' : 'Sent';
      } else {
        smsStatus = parent.phone ? 'Not configured' : 'No Phone';
      }
    } catch (err) {
      smsStatus = 'Failed: ' + (err.message || String(err));
    }
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('Email Status') + 1).setValue(emailStatus);
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('WhatsApp Status') + 1).setValue(whatsappStatus);
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('SMS Status') + 1).setValue(smsStatus);
    return { ok: false, duplicate: true, passId: duplicate.passId };
  }

  const passId = generatePassId_();
  const token = createQrToken_(passId);
  const qrUrl = buildQrImageUrl_(passId);
  const row = [
    new Date(),
    passId,
    token,
    qrUrl,
    parent.parentName,
    parent.email,
    parent.phone,
    parent.whatsappNumber,
    parent.studentName,
    parent.className,
    parent.relation,
    'Registered',
    'Not Entered',
    '',
    '',
    sourceRow,
    '', '', ''
  ];
  passSheet.appendRow(row);
  const newRow = passSheet.getLastRow();
  let emailStatus = 'Not Sent';
  let whatsappStatus = 'Not Sent';
  let smsStatus = 'Not Sent';
  try {
    const sendResult = sendPassEmail_(parent, passId, token, qrUrl) || {};
    emailStatus = sendResult.emailStatus || 'Sent';
    whatsappStatus = sendResult.whatsappStatus || (parent.whatsappNumber ? 'Attempted' : 'No WhatsApp');
    smsStatus = sendResult.smsStatus || (parent.phone ? 'Attempted' : 'No Phone');
  } catch (err) {
    emailStatus = 'Failed: ' + (err.message || String(err));
  }
  try {
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('Email Status') + 1).setValue(emailStatus);
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('WhatsApp Status') + 1).setValue(whatsappStatus);
    passSheet.getRange(newRow, PASS_HEADERS.indexOf('SMS Status') + 1).setValue(smsStatus || (parent.phone ? 'Not Sent' : 'No Phone'));
  } catch (err) {
    // ignore sheet write errors
  }

  return { ok: true, passId };
}

function verifyPassForPreview(tokenOrPassId) {
  const record = getRecordFromTokenOrPassId_(tokenOrPassId);
  if (!record) {
    return { ok: false, status: 'invalid', message: 'Invalid QR code or Pass ID.' };
  }
  if (record.registrationStatus !== 'Registered') {
    return { ok: false, status: 'duplicate_registration', message: 'This registration was marked duplicate.', record };
  }
  return {
    ok: true,
    status: record.entryStatus === 'Entered' ? 'already_entered' : 'ready',
    message: record.entryStatus === 'Entered' ? 'Parent has already entered.' : 'Parent pass is valid.',
    record
  };
}

function markAttendance(tokenOrPassId) {
  const userEmail = getActiveUserEmail_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const passSheet = ss.getSheetByName(CONFIG.PASS_SHEET);
  const attendanceSheet = ensureSheet_(ss, CONFIG.ATTENDANCE_SHEET, ATTENDANCE_HEADERS);
  const duplicateSheet = ensureSheet_(ss, CONFIG.DUPLICATE_SCAN_SHEET, DUPLICATE_HEADERS);
  const record = getRecordFromTokenOrPassId_(tokenOrPassId);

  if (!record) {
    return { ok: false, status: 'invalid', message: 'Invalid QR code or Pass ID.' };
  }
  if (record.registrationStatus !== 'Registered') {
    return { ok: false, status: 'duplicate_registration', message: 'Duplicate registration cannot be checked in.', record };
  }
  if (record.entryStatus === 'Entered') {
    duplicateSheet.appendRow([
      new Date(),
      record.passId,
      record.parentName,
      record.email,
      record.studentName,
      record.entryTime || '',
      userEmail,
      'Duplicate scan after entry'
    ]);
    return { ok: false, status: 'duplicate_scan', message: 'Already entered. Duplicate scan recorded.', record };
  }

  const entryTime = new Date();
  attendanceSheet.appendRow([
    entryTime,
    record.passId,
    record.parentName,
    record.email,
    record.phone,
    record.studentName,
    record.className,
    record.relation,
    userEmail
  ]);

  passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('Entry Status') + 1).setValue('Entered');
  passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('Entry Time') + 1).setValue(entryTime);

  return {
    ok: true,
    status: 'entered',
    message: 'Entry marked successfully.',
    record: Object.assign({}, record, { entryStatus: 'Entered', entryTime })
  };
}

function getDashboardData() {
  const records = getPassRecords_();
  const attendance = getSheetObjects_(CONFIG.ATTENDANCE_SHEET);
  const duplicateScans = getSheetObjects_(CONFIG.DUPLICATE_SCAN_SHEET);
  const registered = records.filter(r => r.registrationStatus === 'Registered');
  const entries = registered.filter(r => r.entryStatus === 'Entered');
  const pending = registered.filter(r => r.entryStatus !== 'Entered');
  const duplicateRegistrations = records.filter(r => r.registrationStatus === 'Duplicate');

  return {
    ok: true,
    generatedAt: new Date(),
    counts: {
      registrations: registered.length,
      entries: entries.length,
      pending: pending.length,
      duplicateRegistrations: duplicateRegistrations.length,
      duplicateScans: duplicateScans.length
    },
    registrations: registered.map(publicRecord_),
    entries: entries.map(publicRecord_),
    pending: pending.map(publicRecord_),
    duplicateRegistrations: duplicateRegistrations.map(publicRecord_),
    duplicateScans,
    attendance
  };
}

function getSubmittedValues_(e) {
  if (e && e.namedValues) {
    return Object.keys(e.namedValues).reduce((acc, key) => {
      acc[key] = Array.isArray(e.namedValues[key]) ? e.namedValues[key][0] : e.namedValues[key];
      return acc;
    }, {});
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FORM_RESPONSE_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const last = values[values.length - 1];
  return headers.reduce((acc, header, index) => {
    acc[header] = last[index];
    return acc;
  }, {});
}

function normalizeParent_(valuesByHeader) {
  return {
    parentName: pickValue_(valuesByHeader, ['Parent Name', 'Father Name', 'Mother Name', 'Guardian Name', 'Name']),
    email: normalizeEmail_(pickValue_(valuesByHeader, ['Email Address', 'Email', 'E-mail', 'Email ID', 'Parent Email', 'Guardian Email'])),
    phone: normalizePhone_(pickValue_(valuesByHeader, ['Phone Number', 'Mobile Number', 'Contact Number', 'Parent Phone', 'Guardian Phone'])),
    whatsappNumber: normalizePhone_(pickValue_(valuesByHeader, ['WhatsApp Number', 'Whatsapp Number', 'WhatsApp No', 'WhatsApp', 'WhatsApp Contact', 'WA Number', 'WhatsApp ID'])) || normalizePhone_(pickValue_(valuesByHeader, ['Phone Number', 'Mobile Number', 'Contact Number', 'Parent Phone', 'Guardian Phone'])),
    studentName: pickValue_(valuesByHeader, ['Student Name', 'Child Name', 'Ward Name']),
    className: pickValue_(valuesByHeader, ['Class', 'Class/Section', 'Grade', 'Section']),
    relation: pickValue_(valuesByHeader, ['Relation', 'Relationship', 'Relation with Student'])
  };
}

function pickValue_(valuesByHeader, aliases) {
  const normalized = {};
  Object.keys(valuesByHeader).forEach(key => {
    normalized[normalizeKey_(key)] = valuesByHeader[key];
  });
  for (const alias of aliases) {
    const value = normalized[normalizeKey_(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function findDuplicateRegistration_(records, parent) {
  return records.find(record => {
    if (record.registrationStatus !== 'Registered') return false;
    const emailMatch = parent.email && normalizeEmail_(record.email) === parent.email;
    const phoneStudentMatch = parent.phone &&
      normalizePhone_(record.phone) === parent.phone &&
      normalizeText_(record.studentName) === normalizeText_(parent.studentName);
    return emailMatch || phoneStudentMatch;
  });
}

function generatePassId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const next = Number(props.getProperty('NEXT_PASS_NUMBER') || '1');
    props.setProperty('NEXT_PASS_NUMBER', String(next + 1));
    const year = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy');
    return `${CONFIG.PASS_PREFIX}-${year}-${String(next).padStart(5, '0')}`;
  } finally {
    lock.releaseLock();
  }
}

function createQrToken_(passId) {
  const signature = Utilities.computeHmacSha256Signature(passId, ensureSecret_())
    .map(byte => (byte + 256).toString(16).slice(-2))
    .join('')
    .slice(0, 24);
  return Utilities.base64EncodeWebSafe(`${passId}.${signature}`);
}

function getPassIdFromToken_(tokenOrPassId) {
  const raw = String(tokenOrPassId || '').trim();
  if (!raw) return '';
  if (raw.startsWith(`${CONFIG.PASS_PREFIX}-`)) return raw;

  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(raw)).getDataAsString();
    const parts = decoded.split('.');
    if (parts.length !== 2) return '';
    const passId = parts[0];
    const expected = createQrToken_(passId);
    return expected === raw ? passId : '';
  } catch (err) {
    return '';
  }
}

function buildQrImageUrl_(token) {
  // For privacy, QR codes should contain only the Pass ID (e.g. AF-2026-00001).
  // The function accepts either a token or a passId; if the input looks like a token,
  // attempt to decode to passId, otherwise use the value directly.
  const raw = String(token || '').trim();
  let passId = raw;
  if (!raw.startsWith(CONFIG.PASS_PREFIX + '-')) {
    // try to decode token -> passId
    const decoded = getPassIdFromToken_(raw);
    if (decoded) passId = decoded;
  }
  return `https://quickchart.io/qr?text=${encodeURIComponent(passId)}&size=500&margin=2`;
}

function buildWhatsappUrl_(rawNumber, scannerUrl, qrUrl) {
  const phone = formatWhatsappPhone_(rawNumber);
  if (!phone) return '';
  const text = encodeURIComponent(
    `${CONFIG.EVENT_NAME} entry pass:\n${scannerUrl}\n\nQR image: ${qrUrl}\n\nDo not forward or download this pass.`
  );
  return `https://api.whatsapp.com/send?phone=${phone}&text=${text}`;
}

function formatWhatsappPhone_(rawNumber) {
  const digits = String(rawNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${CONFIG.DEFAULT_COUNTRY_CODE}${digits}`;
  if (digits.length > 10 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function sendPassEmail_(parent, passId, token, qrUrl) {
  const scannerUrl = buildFrontendScannerUrl_(token);
  const whatsappLink = parent.whatsappNumber ? buildWhatsappUrl_(parent.whatsappNumber, scannerUrl, qrUrl) : '';
  const subject = `${CONFIG.EVENT_NAME}: ${passId}`;
  const bodyLines = [
    `Dear ${parent.parentName || 'Parent'},`,
    '',
    `Your ${CONFIG.SCHOOL_NAME} entry pass is ready.`,
    `Pass ID: ${passId}`,
    `Student: ${parent.studentName}`,
    '',
    `Open the pass link below or show the QR code at the entry gate:`,
    scannerUrl,
    '',
    `QR image: ${qrUrl}`,
    ''
  ];

  if (whatsappLink) {
    bodyLines.push('You can also open this pass through WhatsApp using the link below:');
    bodyLines.push(whatsappLink);
    bodyLines.push('');
  }

  bodyLines.push('Important: Do not forward or download this pass. It is valid only for the registered parent.');
  bodyLines.push('');
  bodyLines.push('Regards,');
  bodyLines.push(CONFIG.SCHOOL_NAME);

  let emailStatus = 'Sent';
  let whatsappStatus = 'Not Sent';
  try {
    MailApp.sendEmail({
      to: parent.email,
      subject,
      body: bodyLines.join('\n'),
      htmlBody: buildPassEmailHtml_(parent, passId, scannerUrl, qrUrl, whatsappLink)
    });
    emailStatus = 'Sent';
  } catch (err) {
    emailStatus = 'Failed: ' + (err.message || String(err));
    Logger.log('Email send failed: %s', err.message || err);
  }

  if (parent.whatsappNumber) {
    if (isTwilioConfigured_()) {
      try {
        sendPassWhatsappNotification_(parent, passId, scannerUrl, qrUrl);
        whatsappStatus = 'Sent (Twilio)';
      } catch (err) {
        whatsappStatus = 'Failed (Twilio): ' + (err.message || String(err));
        Logger.log('WhatsApp notification failed: %s', err.message || err);
      }
    } else if (isWhatsAppCloudConfigured_()) {
      try {
        sendWhatsAppCloudMessage_(parent.whatsappNumber, buildWhatsAppMessageText_(passId, scannerUrl, qrUrl), qrUrl);
        whatsappStatus = 'Sent (Cloud)';
      } catch (err) {
        whatsappStatus = 'Failed (Cloud): ' + (err.message || String(err));
        Logger.log('WhatsApp Cloud notification failed: %s', err.message || err);
      }
    } else {
      whatsappStatus = 'Not configured';
    }
  } else {
    whatsappStatus = 'No WhatsApp';
  }
  // Attempt SMS delivery via Twilio if possible
  let smsStatus = 'Not Sent';
  try {
    const twConfig = getTwilioConfig_();
    if (parent.phone) {
      if (twConfig.accountSid && twConfig.authToken && twConfig.fromSms) {
        try {
          sendSmsViaTwilio_(parent.phone, `${CONFIG.EVENT_NAME} pass: ${passId}\nOpen: ${scannerUrl}`, qrUrl, twConfig);
          smsStatus = 'Sent (Twilio)';
        } catch (err) {
          smsStatus = 'Failed (Twilio): ' + (err.message || String(err));
          Logger.log('SMS send failed: %s', err.message || err);
        }
      } else {
        smsStatus = 'Not configured';
      }
    } else {
      smsStatus = 'No Phone';
    }
  } catch (err) {
    smsStatus = 'Failed: ' + (err.message || String(err));
  }

  return { emailStatus, whatsappStatus, smsStatus };
}

function sendDuplicateRegistrationEmail_(parent, passId) {
  MailApp.sendEmail({
    to: parent.email,
    subject: `${CONFIG.EVENT_NAME}: duplicate registration`,
    body: `Dear ${parent.parentName || 'Parent'},\n\nA pass is already registered for these details.\nExisting Pass ID: ${passId}\n\nRegards,\n${CONFIG.SCHOOL_NAME}`
  });
}

function resendPassById(passId) {
  const record = getPassRecords_().find(item => item.passId === String(passId || '').trim());
  if (!record) {
    throw new Error('Pass ID not found.');
  }
  if (record.registrationStatus !== 'Registered') {
    throw new Error('Only registered passes can be sent.');
  }
  return resendPassRecord_(record);
}

function resendUnsentPasses() {
  const records = getPassRecords_().filter(record => {
    if (record.registrationStatus !== 'Registered') return false;
    const emailStatus = String(record.emailStatus || '').toLowerCase();
    const whatsappStatus = String(record.whatsappStatus || '').toLowerCase();
    return !emailStatus || emailStatus.startsWith('failed') || !whatsappStatus || whatsappStatus.startsWith('failed') || whatsappStatus === 'not configured';
  });

  return records.map(record => {
    try {
      return resendPassRecord_(record);
    } catch (err) {
      return {
        ok: false,
        passId: record.passId,
        message: err.message || String(err)
      };
    }
  });
}

function resendPassRecord_(record) {
  const parent = {
    parentName: record.parentName,
    email: record.email,
    phone: record.phone,
    whatsappNumber: record.whatsappNumber || record.phone,
    studentName: record.studentName,
    className: record.className,
    relation: record.relation
  };
  if (!parent.email) {
    throw new Error('Parent email is missing.');
  }

  const token = record.qrToken || createQrToken_(record.passId);
  const qrUrl = record.qrImageUrl || buildQrImageUrl_(record.passId);
  const result = sendPassEmail_(parent, record.passId, token, qrUrl);
  const passSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PASS_SHEET);

  if (!record.qrToken) {
    passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('QR Token') + 1).setValue(token);
  }
  if (!record.qrImageUrl) {
    passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('QR Image URL') + 1).setValue(qrUrl);
  }
  passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('Email Status') + 1).setValue(result.emailStatus);
  passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('WhatsApp Status') + 1).setValue(result.whatsappStatus);
  passSheet.getRange(record.rowNumber, PASS_HEADERS.indexOf('SMS Status') + 1).setValue(result.smsStatus);

  return {
    ok: true,
    passId: record.passId,
    emailStatus: result.emailStatus,
    whatsappStatus: result.whatsappStatus,
    smsStatus: result.smsStatus
  };
}

function buildPassEmailHtml_(parent, passId, scannerUrl, qrUrl, whatsappLink) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h2 style="margin:0 0 8px">${CONFIG.EVENT_NAME}</h2>
      <p>Dear ${escapeHtml_(parent.parentName || 'Parent')},</p>
      <p>Your parent entry pass is ready.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><b>Pass ID</b></td><td>${escapeHtml_(passId)}</td></tr>
        <tr><td><b>Student</b></td><td>${escapeHtml_(parent.studentName)}</td></tr>
        <tr><td><b>Class</b></td><td>${escapeHtml_(parent.className)}</td></tr>
      </table>
      <p style="margin:18px 0;">Open the digital pass using this link:</p>
      <p><a href="${scannerUrl}" style="display:inline-block;padding:12px 18px;background:#0d5c9e;color:#fff;border-radius:8px;text-decoration:none;">Open digital pass</a></p>
      <p style="margin:18px 0;">Or scan the QR code below:</p>
      <p><img src="${qrUrl}" alt="QR code pass" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:8px;"></p>
      ${whatsappLink ? `<p><a href="${whatsappLink}" style="display:inline-block;padding:12px 18px;background:#25D366;color:#fff;border-radius:8px;text-decoration:none;">Open in WhatsApp</a></p>` : ''}
      <p style="margin-top:16px;color:#555;font-size:0.95rem;">Important: Do not forward or download this pass. It is valid only for the registered parent.</p>
      <p>Regards,<br>${CONFIG.SCHOOL_NAME}</p>
    </div>
  `;
}

function buildWhatsAppMessageText_(passId, scannerUrl, qrUrl) {
  return `${CONFIG.EVENT_NAME} entry pass\n\nPass ID: ${passId}\nOpen pass: ${scannerUrl}\n\nQR image: ${qrUrl}\n\nDo not forward or download this pass.`;
}

function sendPassWhatsappNotification_(parent, passId, scannerUrl, qrUrl) {
  if (!parent.whatsappNumber) return null;
  const config = getTwilioConfig_();
  if (!config.accountSid || !config.authToken || !config.fromNumber) return null;

  const message = buildWhatsAppMessageText_(passId, scannerUrl, qrUrl);
  return sendWhatsAppMessage_(parent.whatsappNumber, message, qrUrl, config);
}

function sendWhatsAppMessage_(rawNumber, body, mediaUrl, config) {
  const phone = formatWhatsappPhone_(rawNumber);
  if (!phone) {
    throw new Error('Invalid WhatsApp number');
  }

  const payload = {
    To: `whatsapp:${phone}`,
    From: `whatsapp:${config.fromNumber}`,
    Body: body
  };
  if (mediaUrl) {
    payload.MediaUrl = mediaUrl;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: payload,
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(`${config.accountSid}:${config.authToken}`)
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`WhatsApp send failed: ${text}`);
  }

  if (status < 200 || status >= 300) {
    throw new Error(`WhatsApp send failed: ${data.message || text}`);
  }

  return data;
}

function formatSmsPhone_(rawNumber) {
  const digits = String(rawNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+${CONFIG.DEFAULT_COUNTRY_CODE}${digits}`;
  if (digits.length > 10 && digits.startsWith('0')) return `+${digits.slice(1)}`;
  if (digits.length > 0 && digits.startsWith(CONFIG.DEFAULT_COUNTRY_CODE)) return `+${digits}`;
  return `+${digits}`;
}

function sendSmsViaTwilio_(rawNumber, body, mediaUrl, config) {
  const phone = formatSmsPhone_(rawNumber);
  if (!phone) throw new Error('Invalid phone number for SMS');

  const from = config.fromSms || config.fromNumber;
  if (!from) throw new Error('Twilio from number is not configured for SMS');

  const payload = {
    To: phone,
    From: from,
    Body: body
  };
  if (mediaUrl) payload.MediaUrl = mediaUrl;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: payload,
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(`${config.accountSid}:${config.authToken}`)
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let data;
  try { data = JSON.parse(text); } catch (err) { throw new Error(`SMS send failed: ${text}`); }
  if (status < 200 || status >= 300) {
    throw new Error(`SMS send failed: ${data.message || text}`);
  }
  return data;
}

function getRecordFromTokenOrPassId_(tokenOrPassId) {
  const passId = getPassIdFromToken_(tokenOrPassId);
  if (!passId) return null;
  return getPassRecords_().find(record => record.passId === passId && record.registrationStatus === 'Registered') || null;
}

function getPassRecords_() {
  return getSheetObjects_(CONFIG.PASS_SHEET).map(row => ({
    rowNumber: row.__rowNumber,
    timestamp: row.Timestamp,
    passId: row['Pass ID'],
    qrToken: row['QR Token'],
    qrImageUrl: row['QR Image URL'],
    parentName: row['Parent Name'],
    email: row.Email,
    phone: row.Phone,
    whatsappNumber: row['WhatsApp Number'],
    studentName: row['Student Name'],
    className: row.Class,
    relation: row.Relation,
    registrationStatus: row['Registration Status'],
      entryStatus: row['Entry Status'],
    entryTime: row['Entry Time'],
    duplicateReason: row['Duplicate Reason'],
    sourceResponseRow: row['Source Response Row']
      ,
      emailStatus: row['Email Status'],
      whatsappStatus: row['WhatsApp Status']
        , smsStatus: row['SMS Status']
  }));
}

function getSheetObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).filter(row => row.some(cell => cell !== '')).map((row, rowIndex) => {
    const obj = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex] instanceof Date
        ? Utilities.formatDate(row[colIndex], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
        : row[colIndex];
    });
    return obj;
  });
}

function publicRecord_(record) {
  return {
    passId: record.passId,
    parentName: record.parentName,
    email: record.email,
    phone: record.phone,
    whatsappNumber: record.whatsappNumber,
    studentName: record.studentName,
    className: record.className,
    relation: record.relation,
    registrationStatus: record.registrationStatus,
    entryStatus: record.entryStatus,
    entryTime: record.entryTime
  };
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    headers.forEach((header, index) => {
      if (existingHeaders[index] !== header) {
        sheet.getRange(1, index + 1).setValue(header);
      }
    });
  }
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function ensureSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('QR_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('QR_SECRET', secret);
  }
  return secret;
}

function normalizeKey_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function normalizeText_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getActiveUserEmail_() {
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Gate scanner';
}

function buildFrontendScannerUrl_(token) {
  const baseUrl = getFrontendBaseUrl_();
  const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

function getFrontendBaseUrl_() {
  const propsUrl = PropertiesService.getScriptProperties().getProperty('GITHUB_PAGES_URL');
  return normalizeUrl_(propsUrl || CONFIG.GITHUB_PAGES_URL || `${ScriptApp.getService().getUrl()}?page=scanner`);
}

function normalizeUrl_(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.endsWith('/') || value.indexOf('?') !== -1 ? value : `${value}/`;
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
