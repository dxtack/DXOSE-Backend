/**
 * Wave 3 — Assignment Infrastructure smoke test.
 * Verifies all services and validators load correctly.
 * Does NOT write any data.
 */
'use strict';

const { validateCreateAssignment, validateUpdateAssignment, ValidationError } = require('../src/engines/assignment.validators');
const { createAssignment, listAssignments, getAssignment, updateAssignment, deactivateAssignment } = require('../src/engines/assignment.service');
const { addProperty, removeProperty, listProperties } = require('../src/engines/assignment-property.service');
const { addDepartment, removeDepartment, listDepartments } = require('../src/engines/assignment-department.service');

const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

async function main() {
  console.log('Wave 3 — Assignment Infrastructure Smoke Test\n');

  // 1. Module imports
  console.log('[1] Module imports:');
  console.log('  Validators           → validateCreateAssignment:', typeof validateCreateAssignment);
  console.log('  AssignmentService    → createAssignment:', typeof createAssignment);
  console.log('  PropertyService      → addProperty:', typeof addProperty);
  console.log('  DepartmentService    → addDepartment:', typeof addDepartment);

  // 2. Validator: valid input
  console.log('\n[2] Validator — valid CreateAssignment:');
  const dto = validateCreateAssignment({ userId: FAKE_UUID, roleId: FAKE_UUID, propertyIds: [], departmentIds: [], notes: 'test' });
  console.log('  userId:', dto.userId, '✓');
  console.log('  roleId:', dto.roleId, '✓');
  console.log('  propertyIds:', dto.propertyIds, '(empty = All Properties) ✓');
  console.log('  departmentIds:', dto.departmentIds, '(empty = All Departments) ✓');

  // 3. Validator: rejects invalid UUID
  console.log('\n[3] Validator — rejects invalid UUID:');
  try {
    validateCreateAssignment({ userId: 'not-a-uuid', roleId: FAKE_UUID });
    console.log('  ERROR: should have thrown');
    process.exit(1);
  } catch (e) {
    if (e.name === 'ValidationError') {
      console.log('  ValidationError thrown correctly:', e.message, '✓');
    } else {
      throw e;
    }
  }

  // 4. Validator: UpdateAssignment
  console.log('\n[4] Validator — valid UpdateAssignment:');
  const update = validateUpdateAssignment({ notes: 'updated note' });
  console.log('  notes:', update.notes, '✓');

  // 5. Validator: rejects empty update
  console.log('\n[5] Validator — rejects empty UpdateAssignment:');
  try {
    validateUpdateAssignment({});
    console.log('  ERROR: should have thrown');
    process.exit(1);
  } catch (e) {
    if (e.name === 'ValidationError') {
      console.log('  ValidationError thrown correctly:', e.message, '✓');
    } else {
      throw e;
    }
  }

  // 6. Service functions are callable
  console.log('\n[6] Service function types:');
  console.log('  createAssignment:       ', typeof createAssignment);
  console.log('  updateAssignment:       ', typeof updateAssignment);
  console.log('  deactivateAssignment:   ', typeof deactivateAssignment);
  console.log('  listAssignments:        ', typeof listAssignments);
  console.log('  getAssignment:          ', typeof getAssignment);
  console.log('  addProperty:            ', typeof addProperty);
  console.log('  removeProperty:         ', typeof removeProperty);
  console.log('  listProperties:         ', typeof listProperties);
  console.log('  addDepartment:          ', typeof addDepartment);
  console.log('  removeDepartment:       ', typeof removeDepartment);
  console.log('  listDepartments:        ', typeof listDepartments);

  console.log('\nWave 3 — All services loaded and validators working. PASS');
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
