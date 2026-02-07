"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLifeMapEvent = void 0;
const functions = __importStar(require("firebase-functions"));
/**
 * Triggered by the creation of a new LifeMapEvent document.
 * This function orchestrates the entire Life-Map generation pipeline:
 * 1. Ingests the raw event.
 * 2. Enriches it with additional context (location, weather, etc.).
 * 3. Structures the event into the correct chapter.
 * 4. Updates and versions the user's LifeMap.
 * 5. Triggers the Replay Engine if the LifeMap is complete.
 */
exports.processLifeMapEvent = functions.firestore
    .document('lifeMapEvents/{eventId}')
    .onCreate(async (snap, context) => {
    const event = snap.data();
    const { eventId } = context.params;
    console.log(`[${eventId}] Processing new LifeMapEvent for user ${event.userId}...`);
    // TODO: Implement the full pipeline:
    // 1. Enrich event
    // 2. Find or create LifeMap
    // 3. Add to correct Chapter
    // 4. Save and version LifeMap
    // 5. Trigger Replay Engine
    console.log(`[${eventId}] Successfully processed event.`);
    return null;
});
