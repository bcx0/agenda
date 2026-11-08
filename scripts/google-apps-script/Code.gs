/**
 * Relais Google Calendar pour l'app Agenda Geoffrey Mahieu.
 *
 * Déployé en « Application Web » dans le compte Google de l'agenda
 * (exécuté en tant que ce compte). L'app lui envoie la requête Calendar à
 * faire ; le script l'exécute avec le token que Google gère lui-même pour ce
 * script, puis renvoie { status, body }. Plus aucun refresh token côté app.
 *
 * Propriété du script obligatoire (Paramètres du projet > Propriétés du
 * script) : PROXY_SECRET = même valeur que GOOGLE_PROXY_SECRET sur Vercel.
 */

var ALLOWED_PREFIX = 'https://www.googleapis.com/calendar/v3/';
var ALLOWED_METHODS = { GET: true, POST: true, PUT: true, PATCH: true, DELETE: true };

function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_(400, '{"error":"proxy_bad_json"}');
  }

  var expected = PropertiesService.getScriptProperties().getProperty('PROXY_SECRET');
  if (!expected || !request || request.secret !== expected) {
    return reply_(403, '{"error":"proxy_forbidden"}');
  }

  var url = String(request.url || '');
  var method = String(request.method || 'GET').toUpperCase();
  if (url.indexOf(ALLOWED_PREFIX) !== 0 || !ALLOWED_METHODS[method]) {
    return reply_(400, '{"error":"proxy_request_not_allowed"}');
  }

  var params = {
    method: method.toLowerCase(),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  };
  if (request.body !== null && request.body !== undefined) {
    params.payload = String(request.body);
    params.contentType = 'application/json';
  }

  var response = UrlFetchApp.fetch(url, params);
  return reply_(response.getResponseCode(), response.getContentText());
}

/** Santé du relais : ouvrir l'URL /exec dans un navigateur doit afficher ok. */
function doGet() {
  return ContentService.createTextOutput('ok');
}

/**
 * À lancer UNE fois à la main depuis l'éditeur (bouton Exécuter) pour
 * accorder les autorisations au script. Affiche le nom de l'agenda principal.
 */
function autoriser() {
  var res = UrlFetchApp.fetch(ALLOWED_PREFIX + 'calendars/primary', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  Logger.log('Calendar API : HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
}

function reply_(status, body) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: status, body: body }))
    .setMimeType(ContentService.MimeType.JSON);
}
