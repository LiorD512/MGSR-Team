/**
 * Shared callable: Contacts CRUD.
 * Single source for create, update, delete — called by both Android & Web.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { CONTACTS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { validateContact, requireId } = require("../lib/validation");

function getDb() {
  return getFirestore();
}

async function contactsCreate(data) {
  validatePlatform(data.platform);
  const payload = validateContact(data);
  const col = CONTACTS_COLLECTIONS[data.platform];
  const ref = await getDb().collection(col).add(payload);
  return { id: ref.id };
}

async function contactsUpdate(data) {
  validatePlatform(data.platform);
  const contactId = requireId(data.contactId, "contactId");
  const payload = validateContact(data);
  const col = CONTACTS_COLLECTIONS[data.platform];
  await getDb().collection(col).doc(contactId).update(payload);
  return { success: true };
}

async function contactsDelete(data) {
  validatePlatform(data.platform);
  const contactId = requireId(data.contactId, "contactId");
  const col = CONTACTS_COLLECTIONS[data.platform];
  await getDb().collection(col).doc(contactId).delete();
  return { success: true };
}

module.exports = { contactsCreate, contactsUpdate, contactsDelete };
