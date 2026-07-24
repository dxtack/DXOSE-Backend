'use strict';

const {
    mapUserFacingState,
    isEditableUserState,
    isGrnReturned,
    isGetPassReturned,
    SEND_BACK_NOTES_MARKER,
} = require('./lifecyclePresentation.service');

describe('lifecyclePresentation.service — Wave 2 central statuses', () => {
    const sendBackNotes = `${SEND_BACK_NOTES_MARKER} fix lines`;

    describe('Returned (Send Back → creator)', () => {
        it('maps GRN DRAFT + send-back notes to Returned', () => {
            expect(mapUserFacingState('GRN', 'DRAFT', { notes: sendBackNotes })).toBe('Returned');
        });

        it('maps GET_PASS DRAFT + send-back notes to Returned', () => {
            expect(mapUserFacingState('GET_PASS', 'DRAFT', { notes: sendBackNotes })).toBe('Returned');
        });

        it('maps TRANSFER DRAFT + send-back notes to Returned', () => {
            expect(mapUserFacingState('TRANSFER', 'DRAFT', { notes: sendBackNotes })).toBe('Returned');
        });

        it('maps BREAKAGE DRAFT + send-back notes to Returned', () => {
            expect(mapUserFacingState('BREAKAGE', 'DRAFT', { notes: sendBackNotes })).toBe('Returned');
        });

        it('plain DRAFT without send-back stays Draft', () => {
            expect(mapUserFacingState('GRN', 'DRAFT', { notes: 'normal draft' })).toBe('Draft');
        });

        it('legacy isGrnReturned / isGetPassReturned aliases', () => {
            expect(isGrnReturned('DRAFT', sendBackNotes)).toBe(true);
            expect(isGetPassReturned('DRAFT', sendBackNotes)).toBe(true);
        });
    });

    describe('Voided (Void action terminal state)', () => {
        it('maps movement VOID to Voided', () => {
            expect(mapUserFacingState('BREAKAGE', 'VOID')).toBe('Voided');
            expect(mapUserFacingState('LOST', 'VOID')).toBe('Voided');
        });

        it('maps inventory count VOID/CANCELLED to Voided', () => {
            expect(mapUserFacingState('INVENTORY_COUNT', 'VOID')).toBe('Voided');
            expect(mapUserFacingState('COUNT', 'CANCELLED')).toBe('Voided');
        });
    });

    describe('In Review consolidation', () => {
        it('never exposes raw PENDING_FINANCE to users', () => {
            expect(mapUserFacingState('GRN', 'PENDING_FINANCE')).toBe('In Review');
            expect(mapUserFacingState('TRANSFER', 'PENDING_FINANCE')).toBe('In Review');
        });
    });

    describe('editability', () => {
        it('Draft and Returned are editable', () => {
            expect(isEditableUserState('Draft')).toBe(true);
            expect(isEditableUserState('Returned')).toBe(true);
            expect(isEditableUserState('Sent Back')).toBe(false);
        });
    });
});
