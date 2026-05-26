// Central registration point for undo handlers.
// Importing this module causes all handlers to register themselves with
// the registry in ./undo. The /api/undo route imports this so every kind
// is available when a token is consumed.
//
// Add new handler files here as they are written.

import "./undo-handlers/tasks";
import "./undo-handlers/outbox";
