const svc = require('../services/inventoryCount.service');

function sendOk(res, body) {
  return res.status(200).json(body);
}

function sendCreated(res, body) {
  return res.status(201).json(body);
}

function sendBizError(res, { statusCode = 400, code, message, details }) {
  return res.status(statusCode).json({
    error: {
      code: code || 'BAD_REQUEST',
      message: message || 'Bad request',
      details: details || [],
    },
  });
}

function asBizErr(err) {
  if (!err) return null;
  if (err.isBizError) return err;
  if (err.status === 409 && err.code) {
    return {
      isBizError: true,
      statusCode: 409,
      code: err.code,
      message: err.message,
      details: [],
    };
  }
  if (err.name === 'ValidationError') {
    return {
      isBizError: true,
      statusCode: 400,
      code: err.code || 'VALIDATION_ERROR',
      message: err.message,
      details: err.errors || [],
    };
  }
  if (err.statusCode && err.code) return { isBizError: true, ...err };
  return null;
}

exports.createSession = async (req, res, next) => {
  try {
    const session = await svc.createSession(req.user.tenantId, req.user, req.body);
    return sendCreated(res, session);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    const result = await svc.listSessions(req.user.tenantId, req.query);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    const session = await svc.getSession(req.user.tenantId, req.params.id);
    return sendOk(res, session);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.startSession = async (req, res, next) => {
  try {
    const result = await svc.startSession(req.user.tenantId, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.cancelSession = async (req, res, next) => {
  try {
    const result = await svc.cancelSession(req.user.tenantId, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.getCountSheet = async (req, res, next) => {
  try {
    const result = await svc.getCountSheet(req.user.tenantId, req.params.id, req.params.locationId, req.query);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.updateCountedQty = async (req, res, next) => {
  try {
    const result = await svc.updateCountedQty(
      req.user.tenantId,
      req.user,
      req.params.id,
      req.params.locationId,
      req.params.itemId,
      req.body,
    );
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.submitCounts = async (req, res, next) => {
  try {
    const result = await svc.submitCounts(req.user.tenantId, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.startRecount = async (req, res, next) => {
  try {
    const result = await svc.startRecount(req.user.tenantId, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.getVariances = async (req, res, next) => {
  try {
    const result = await svc.getVariances(req.user.tenantId, req.params.id, req.query);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.submitForApproval = async (req, res, next) => {
  try {
    const result = await svc.submitForApproval(req.user.tenantId, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const result = await svc.approve(req.user.tenantId, req.user.id, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const result = await svc.reject(req.user.tenantId, req.user.id, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.sendBack = async (req, res, next) => {
  try {
    const result = await svc.sendBack(req.user.tenantId, req.user.id, req.user, req.params.id, req.body);
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.exportExcel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { locationId } = req.query;
    const buf = await svc.exportExcel(req.user.tenantId, id, {
      locationId: locationId ? String(locationId) : undefined,
    });
    const filename = `Inventory_Count_${id}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.exportPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const buf = await svc.exportPdf(req.user.tenantId, id);
    res.setHeader('Content-Disposition', `attachment; filename="Inventory_Count_${id}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};

exports.uploadExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendBizError(res, {
        statusCode: 400,
        code: 'COUNT_UPLOAD_NO_FILE',
        message: 'No file uploaded',
        details: [],
      });
    }
    const { id } = req.params;
    const { locationId, roundNo, concurrencyVersion } = req.body || {};
    const result = await svc.uploadExcel(req.user.tenantId, req.user, id, req.file.buffer, {
      locationId: locationId ? String(locationId) : undefined,
      roundNo: roundNo ? Number(roundNo) : undefined,
      concurrencyVersion:
        concurrencyVersion != null && concurrencyVersion !== ''
          ? Number(concurrencyVersion)
          : undefined,
    });
    return sendOk(res, result);
  } catch (err) {
    const biz = asBizErr(err);
    if (biz) return sendBizError(res, biz);
    return next(err);
  }
};
