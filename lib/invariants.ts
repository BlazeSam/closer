// Properties of the design, not of any one negotiation. Kept in a module with no imports so the
// client bundle can show them without dragging Prisma in.
export const INVARIANTS = [
  "The model never receives the seller's minimum or auto-accept price.",
  "Every price is decided by a policy in code, never by the model.",
  "The model writes no digits: it emits placeholders the server fills in.",
  "The PayPal amount is read from the database, not from this chat.",
];
