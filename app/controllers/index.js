var randomstring = require('randomstring')
  , Validr = require('validr')
  , Promise = require('bluebird')
  , request = require('superagent')
  ;

module.exports = {
  index: index,
  session: session,
  initiate: initiate,
  response: response,
  release: release,
  timeout: timeout
};


function index (req, res, next) {
  res.clearCookie('session');
  res.render('index', {
    ClientUrl: req.cookies.ClientUrl,
    ServiceCode: req.cookies.ServiceCode || '',
    msisdn: req.cookies.msisdn || '',
  });
}

function session (req, res, next) {
  var session = req.cookies.session;
  if (!session) 
    return res.redirect('/');
  session.response.message = session.response.message
    .substr(0, 182)
    .replace('#', '<br>')
    .replace('#', '<br>')
    .replace('#', '<br>');
  res.render('session', {
    session: session
  });
}

function initiate (req, res, next) {
  var body = req.body;
  var errors = validateInitiate(body);
  if (errors) return res.redirect('/');
  var serviceCode = body.ServiceCode;
  var session = {};
  session.ClientUrl = body.Url;
  session.request = {
    sessionId: randomstring.generate(32),
    ServiceCode: serviceCode,
    msisdn: body.Mobile,
    input: serviceCode,
    newRequest: 1      
  };
  messageClient(session)
  .then(function (session) {
    res.cookie('session', session);
    res.cookie('ClientUrl', session.ClientUrl);
    res.cookie('ServiceCode', session.request.ServiceCode);
    res.cookie('sessionId', session.request.sessionId);
    res.cookie('msisdn', session.request.msisdn);
    res.cookie('input', session.request.input);
    res.redirect('/session');
  }).catch(next);
}

function response (req, res, next) {
  var session = req.cookies.session;
  if (!session) return res.redirect('/');
  session.request.input = req.body.UserInput || '';
  session.request.newRequest = 0;
  messageClient(session)
  .then(function (session) {
    res.cookie('session', session);
    res.redirect('/session');
  }).catch(next);
}

function release (req, res, next) {
  var session = req.cookies.session;
  if (!session) return res.redirect('/');
  session.request.input = '';
  session.request.newRequest = 0;
  messageClient(session)
  .then(function (session) {
    res.cookie('session', session);
    res.redirect('/session');
  }).catch(next);
}

function timeout (req, res, next) {
  var session = req.cookies.session;
  if (!session) return res.redirect('/');
  session.request.Type = 'Timeout';
  session.request.Message = '';
  session.request.ClientState = session.response.ClientState || '';
  session.request.Sequence += 1;
  messageClient(session)
  .then(function (session) {
    res.cookie('session', session);
    res.redirect('/session');
  }).catch(next);
}


/*
  Helper functions
  ----------------
 */

/**
 * Validate initiate action
 * @param  {object} body
 * @return {bool}    
 */
function validateInitiate (body) {
  var validr = new Validr(body);
  validr.validate('Url', 'Url must be valid number.')
    .isLength(1).isURL();
  return validr.validationErrors(true);
}

function validateResponse (body) {
  var validr = new Validr(body);
  validr.validate('UserInput', 'User input must be valid number')
    .isLength(1).isNumeric();
  return validr.validationErrors(true);
}

function validateUssdResponse (body) {
  var validr = new Validr(body);
  validr.validate('Type', 'Type is required.')
    .isLength(1);
  validr.validate('Message', 'Message is required.')
    .isLength(1);
  return validr.validationErrors(true);
}

/**
 * Generate SMSGH USSD request
 * @param  {object} session Cookie session
 * @param  {object} body    session action request body
 * @return {object} 
 */
function generateResponseRequest (session, body) {
  return {
    Mobile: session.Mobile,
    SessionId: session.Id,
    ServiceCode: session.ServiceCode,
    Type: session.Type,
    Message: body.UserInput || '',
    Operator: session.Operator,
    Sequence: session.Sequence
  };
}

function messageClient (session) {
  return new Promise(function (resolve, reject) {
    request.get(session.ClientUrl)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send(session.request)
    .end(function (err, res) {
      if (err) return reject(err);
      if (!res.ok) 
        return reject(new Error("Didn't get a successful response from client at "
          + res.status + res.body + session.ClientUrl));
      session.response = res.body;
      resolve(session);
    })
  });
}