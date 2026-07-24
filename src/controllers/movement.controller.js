const movementService = require('../services/movement.service');

const { assertDirectApiCreateType } = require('../services/movementDirectAdjustment.guard');

const { success } = require('../utils/response');

const { parseVersionFromRequest } = require('../platform/concurrency.service');
const { assertActiveAssignmentForMutation } = require('../services/scope/assignment-mutation.guard');



/**

 * @desc    Create a new direct adjustment draft (ADJUSTMENT only)

 * @route   POST /api/movements

 * @access  Private — ADJUSTMENT_CREATE

 */

const createMovement = async (req, res, next) => {

    try {

        assertDirectApiCreateType(req.body?.movementType);

        req.body.movementType = 'ADJUSTMENT';



        const document = await movementService.createMovementDraft(
            req.body,
            req.user.tenantId,
            req.user.id,
            undefined,
            {
                origin: 'DIRECT_API',
                clientRequestKey: req.body?.clientRequestKey,
            },
            req.user,
        );

        return success(res, document, 'Movement document created successfully', 201);

    } catch (error) {

        next(error);

    }

};



/**

 * @desc    Get paginated list of movement documents

 * @route   GET /api/movements

 * @access  Private

 */

const getMovements = async (req, res, next) => {

    try {

        const result = await movementService.getMovements(req.user.tenantId, req.query, req.user);

        return success(res, result.documents, 'Movement documents fetched successfully', 200, {

            total: result.total,

            skip: parseInt(req.query.skip) || 0,

            take: parseInt(req.query.take) || 10,

        });

    } catch (error) {

        next(error);

    }

};



/**

 * @desc    Get movement document by ID

 * @route   GET /api/movements/:id

 * @access  Private

 */

const getMovement = async (req, res, next) => {

    try {

        const document = await movementService.getMovementById(req.params.id, req.user.tenantId, req.user);

        return success(res, document, 'Movement document fetched successfully');

    } catch (error) {

        next(error);

    }

};



/**

 * @desc    Update a movement document (only if Draft or Rejected)

 * @route   PUT /api/movements/:id

 * @access  Private — ADJUSTMENT_CREATE or MOVEMENT_CREATE (by doc type)

 */

const updateMovement = async (req, res, next) => {

    try {

        const document = await movementService.updateMovementDraft(

            req.params.id,

            req.body,

            req.user.tenantId,

            req.user.id,

            parseVersionFromRequest(req),

        );

        return success(res, document, 'Movement document updated successfully');

    } catch (error) {

        next(error);

    }

};



const postMovement = async (req, res, next) => {

    try {

        await assertActiveAssignmentForMutation(req.user, req.user.tenantId, 'post');

        const document = await require('../services/posting.service').postDocument(

            req.params.id,

            req.user.tenantId,

            req.user.id,

            undefined,

            parseVersionFromRequest(req),

        );

        return success(res, document, 'Movement document posted successfully');

    } catch (error) {

        next(error);

    }

};



module.exports = {

    createMovement,

    getMovements,

    getMovement,

    updateMovement,

    postMovement

};


