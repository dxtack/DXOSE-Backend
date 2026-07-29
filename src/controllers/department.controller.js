const departmentService = require('../services/department.service');
const locationService = require('../services/location.service');
const { success, created } = require('../utils/response');

const createDepartment = async (req, res, next) => {
    try {
        const dept = await departmentService.createDepartment(req.body, req.user.tenantId);
        return created(res, dept, 'Department created');
    } catch (err) { next(err); }
};

const getDepartments = async (req, res, next) => {
    try {
        const result = await departmentService.getDepartments(req.user.tenantId, req.query, req.user);
        return success(res, result.departments, 'Departments fetched successfully', 200, {
            total: result.total,
            skip: result.skip,
            take: result.take,
        });
    } catch (err) { next(err); }
};

/**
 * @desc    Departments that have at least one linked location (lookup)
 * @route   GET /api/departments/with-locations
 */
const getDepartmentsWithLocations = async (req, res, next) => {
    try {
        const result = await departmentService.getDepartmentsWithLocations(
            req.user.tenantId,
            req.query,
            req.user,
        );
        return success(res, result.departments, 'Departments with locations fetched successfully', 200, {
            total: result.total,
            skip: result.skip,
            take: result.take,
        });
    } catch (err) { next(err); }
};

const getDepartment = async (req, res, next) => {
    try {
        const dept = await departmentService.getDepartmentById(req.params.id, req.user.tenantId, req.user);
        return success(res, dept);
    } catch (err) { next(err); }
};

/**
 * @desc    Locations for a department (lookup)
 * @route   GET /api/departments/:id/locations
 */
const getDepartmentLocations = async (req, res, next) => {
    try {
        const result = await locationService.getLocations(
            req.user.tenantId,
            { ...req.query, departmentId: req.params.id },
            req.user,
        );
        if (result.slim) {
            return success(res, result.locations, 'Locations fetched successfully', 200);
        }
        return success(res, result.locations, 'Locations fetched successfully', 200, {
            total: result.total,
            skip: result.skip,
            take: result.take,
        });
    } catch (err) { next(err); }
};

const updateDepartment = async (req, res, next) => {
    try {
        const dept = await departmentService.updateDepartment(req.params.id, req.body, req.user.tenantId);
        return success(res, dept, 'Department updated');
    } catch (err) { next(err); }
};

const deleteDepartment = async (req, res, next) => {
    try {
        await departmentService.deleteDepartment(req.params.id, req.user.tenantId);
        return success(res, null, 'Department deleted');
    } catch (err) { next(err); }
};

const toggleDepartment = async (req, res, next) => {
    try {
        const dept = await departmentService.toggleDepartment(req.params.id, req.user.tenantId);
        return success(res, dept, `Department ${dept.isActive ? 'activated' : 'deactivated'}`);
    } catch (err) { next(err); }
};

module.exports = {
    createDepartment,
    getDepartments,
    getDepartmentsWithLocations,
    getDepartment,
    getDepartmentLocations,
    updateDepartment,
    deleteDepartment,
    toggleDepartment,
};
