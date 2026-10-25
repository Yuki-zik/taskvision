import type { TreeNode, TodoNode } from './model';
import * as utils from './utils';
import * as taskState from './taskState';

// INTENT: Persist source IDs only when annotations need durable references or
// when the user explicitly exports the selected scope.
export interface SyncOptions {
  forceStableIds?: boolean;
  scopeNodesByRoot?: Record<string, TodoNode[]>;
  scopeNodes?: TodoNode[];
  updatedAt?: string;
  actor?: string;
  rebuildContext?: boolean;
}
export function isTaskAnnotationNode(
  node: TreeNode | undefined,
): node is TodoNode & { annotationKind?: 'task' } {
  return (
    !!node &&
    node.type === 'todo' &&
    node.annotationKind !== 'context' &&
    node.annotationKind !== 'review'
  );
}

export function isContextAnnotationNode(
  node: TreeNode | undefined,
): node is TodoNode & { annotationKind: 'context' } {
  return !!node && node.type === 'todo' && node.annotationKind === 'context';
}

export function isReviewAnnotationNode(
  node: TreeNode | undefined,
): node is TodoNode & { annotationKind: 'review' } {
  return !!node && node.type === 'todo' && node.annotationKind === 'review';
}

export function getSyncNodesForRoot(
  rootPath: string,
  allNodes: TodoNode[],
  syncOptions?: SyncOptions,
  resolveRoot?: (file: string) => string | undefined,
) {
  const options = syncOptions || {};
  let scopeNodes;

  if (options.scopeNodesByRoot && Array.isArray(options.scopeNodesByRoot[rootPath])) {
    scopeNodes = options.scopeNodesByRoot[rootPath];
  } else if (Array.isArray(options.scopeNodes)) {
    scopeNodes = options.scopeNodes;
  }

  if (scopeNodes) {
    return scopeNodes.filter(function (node) {
      return node && (node.rootPath || resolveRoot?.(node.fsPath)) === rootPath;
    });
  }

  return allNodes.filter((node) => (node.rootPath || resolveRoot?.(node.fsPath)) === rootPath);
}

export function deriveStableIdForNode(node: TodoNode) {
  if (!node) {
    return undefined;
  }

  if (node.stableId) {
    return node.stableId;
  }

  if (isTaskAnnotationNode(node)) {
    return utils.createTaskStableId(
      node.rootPath,
      node.fsPath,
      node.actualTag || node.tag,
      node.after || node.label,
      node.subTag,
    );
  }

  return utils.createContextStableId(
    node.rootPath,
    node.fsPath,
    node.after || node.label,
    node.contextKind || node.reviewKind || node.status,
    (node.line ?? 0) + 1,
  );
}

export function buildDirectivePatchForNode(node: TodoNode, stableId: string) {
  return {
    stableId: stableId,
    contextKind: node.contextKind,
    taskRefs: node.taskRefs,
    reviewKind: node.reviewKind,
    sessionId: node.sessionId,
  };
}

export function collectReferencedStableIds(nodes: TodoNode[]) {
  const referencedStableIds: Record<string, boolean> = {};
  (nodes || []).forEach(function (node) {
    ((node && node.taskRefs) || []).forEach(function (taskRef) {
      referencedStableIds[taskRef] = true;
    });
    ((node && node.contextRefs) || []).forEach(function (contextRef) {
      referencedStableIds[contextRef] = true;
    });
  });
  return referencedStableIds;
}

export function shouldEnsureStableIdForNode(
  node: TodoNode,
  options: SyncOptions | undefined,
  referencedStableIds: Record<string, boolean>,
  defaultPriority: string,
) {
  const ensureOptions = options || {};
  if (ensureOptions.forceStableIds === true) {
    return true;
  }

  if (!node) {
    return false;
  }

  if (isContextAnnotationNode(node)) {
    return !!node.contextKind;
  }

  if (!isTaskAnnotationNode(node)) {
    return false;
  }

  const derivedStableId = deriveStableIdForNode(node);
  if (derivedStableId && referencedStableIds && referencedStableIds[derivedStableId] === true) {
    return true;
  }

  if (node.note) {
    return true;
  }

  if (node.priority && node.priority !== defaultPriority) {
    return true;
  }

  if (Array.isArray(node.contextRefs) && node.contextRefs.length > 0) {
    return true;
  }

  const status =
    taskState.normaliseStatus(node.status) ||
    taskState.defaultStatusForTag(node.actualTag || node.tag);
  return status !== 'todo' && status !== 'idea';
}
