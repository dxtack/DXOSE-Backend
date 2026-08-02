'use strict';

const { success } = require('../utils/response');
const workflowPipelineService = require('../services/workflow-pipeline/workflow-pipeline.service');

const userCtx = (req) => ({
    id: req.user?.id,
    role: req.user?.role,
    roleId: req.user?.roleId || null,
    permissions: Array.isArray(req.user?.permissions) ? req.user.permissions : [],
    departmentId: req.user?.departmentId || null,
});

exports.getPipeline = async (req, res, next) => {
    try {
        const data = await workflowPipelineService.getWorkflowPipeline(
            req.user.tenantId,
            userCtx(req),
            req.query,
        );
        return success(res, data);
    } catch (err) {
        next(err);
    }
};

exports.getSummary = async (req, res, next) => {
    try {
        const data = await workflowPipelineService.getWorkflowPipelineSummary(
            req.user.tenantId,
            userCtx(req),
        );
        return success(res, data);
    } catch (err) {
        next(err);
    }
};

exports.getAlerts = async (req, res, next) => {
    try {
        const limit = Math.min(30, parseInt(req.query.limit, 10) || 15);
        const ctx = userCtx(req);
        let items = await workflowPipelineService.getWorkflowPipelineAlerts(
            req.user.tenantId,
            ctx,
            { limit: 200 },
        );
        items = workflowPipelineService.applyFilters(items, req.query, ctx).slice(0, limit);
        const summary = await workflowPipelineService.getWorkflowPipelineSummary(
            req.user.tenantId,
            ctx,
        );
        return success(res, {
            items,
            totalCount: summary.total,
            critical: summary.critical,
            warning: summary.warning,
            mine: summary.mine,
            overdue: summary.overdue,
            getPassOverdue: summary.getPassOverdue,
        });
    } catch (err) {
        next(err);
    }
};

exports.markAlertsRead = async (req, res, next) => {
    try {
        const data = await workflowPipelineService.markWorkflowAlertsRead(
            req.user.tenantId,
            userCtx(req),
            req.body || {},
        );
        return success(res, data, 'Alerts marked as read');
    } catch (err) {
        next(err);
    }
};
