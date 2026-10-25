import type * as vscode from 'vscode';
import type { DirectiveOptions, AnnotationKind } from './annotationParser';
import type { TaskStatus } from './taskState';

// Legacy extension domain: sidecars and editor coordinates are deliberately kept
// separate from the workspace service's SQLite records and one-based positions.
export type Logger = (message: string) => void;
export type ExtensionState = Pick<
  vscode.ExtensionContext,
  'workspaceState' | 'globalState' | 'subscriptions' | 'extensionPath' | 'asAbsolutePath'
>;
export interface OffsetRange {
  start: number;
  end: number;
}
export interface SearchResult {
  uri: vscode.Uri;
  line: number;
  column: number;
  match: string;
  fsPath?: string;
  extraLines?: SearchResult[];
  added?: boolean;
  expanded?: boolean;
}
export interface ExtractedTag extends DirectiveOptions {
  tag: string;
  actualTag?: string;
  withoutTag: string;
  before: string;
  after: string;
  text?: string;
  tagOffset?: number;
  commentStart: number;
  subTag?: string;
  status?: TaskStatus;
  hasExplicitStatus: boolean;
  inlineStatusToken?: string;
  sourceOfTruth?: string;
  annotationKind?: AnnotationKind;
  tvDirectives?: DirectiveOptions;
}
export interface TaskEntry {
  stableId?: string;
  priority?: string;
  note: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  contextRefs: string[];
  lastActor?: string;
  updatedAt?: string;
  lastExportedStatus?: string;
  lastExportedAt?: string;
  file?: string;
  line?: number;
}
export type TaskPatch = Partial<TaskEntry> & { replaceContextRefs?: boolean };
export interface TaskStore {
  version: number;
  tasks: Record<string, TaskEntry>;
  stableIndex: Record<string, string>;
}
export interface Anchor {
  file: string;
  line: number;
  tag: string;
}
export interface ContextEntry {
  kind?: string;
  title: string;
  summary: string;
  body: string;
  taskRefs: string[];
  anchors: Anchor[];
  updatedBy?: string;
  updatedAt?: string;
  freshness: string;
}
export interface ContextCard extends ContextEntry {
  contextId: string;
}
export type ContextPatch = Partial<ContextEntry> & {
  replaceTaskRefs?: boolean;
  replaceAnchors?: boolean;
};
export interface ContextIndex {
  version: number;
  contexts: Record<string, ContextEntry>;
}
export interface SessionAnnotation {
  annotationId?: string;
  kind: string;
  file: string;
  line: number;
  stableId?: string;
  sourceComment: boolean;
  reviewState: string;
  text: string;
}
export interface ChangeSession {
  version: number;
  sessionId: string;
  sessionType: string;
  actor: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  taskRefs: string[];
  summary: string;
  annotations: SessionAnnotation[];
}
export interface TreeNode extends Partial<TaskEntry>, DirectiveOptions {
  id?: number;
  type: string;
  label: string;
  fsPath: string;
  visible: boolean;
  nodes?: TreeNode[];
  extraLines?: TreeNode[];
  line?: number;
  column?: number;
  pathElement?: string;
  pathLabel?: string;
  root?: TreeNode;
  uri?: vscode.Uri;
  isFolder?: boolean | string;
  isWorkspaceNode?: boolean;
  isRootTagNode?: boolean;
  isStatusNode?: boolean;
  expanded?: boolean;
  tag?: string;
  actualTag?: string;
  subTag?: string;
  before?: string;
  after?: string;
  taskId?: string;
  status?: string;
  hasExplicitStatus?: boolean;
  inlineStatusToken?: string;
  sourceOfTruth?: string;
  annotationKind?: AnnotationKind;
  contextId?: string;
  tvDirectives?: DirectiveOptions;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  icon?: string;
  rootPath?: string;
  explicitStableId?: string;
  endColumn?: number;
  isExtraLine?: boolean;
  parent?: TreeNode;
  hidden?: boolean;
  showCount?: boolean;
  notExported?: boolean;
  empty?: boolean;
  text?: TreeNode[];
  command?: vscode.Command;
  contextKind?: string;
  reviewKind?: string;
}
export interface TodoNode extends TreeNode {
  line: number;
  column: number;
  endColumn: number;
  taskId?: string;
  tag: string;
  extraLines: TodoNode[];
}
export interface PathNode extends TreeNode {
  nodes: TreeNode[];
}
export interface ExportTree {
  [label: string]: ExportTree | string | boolean;
}

export interface HighlightSettings {
  icon?: string;
  iconColor?: string;
  iconColour?: string;
  foreground?: string;
  background?: string;
  opacity?: number | string | null;
  foregroundOpacity?: number | string | null;
  glowOpacity?: number | string | null;
  glassOpacity?: number | string | null;
  glassBorderOpacity?: number | string | null;
  rulerOpacity?: number | string | null;
  rulerColour?: string;
  rulerLane?: string | number;
  borderRadius?: string;
  scheme?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  colorType?: string;
  glowType?: string;
  glassType?: string;
  fontType?: string;
  type?: string;
  gutterIcon?: boolean;
  hideFromTree?: boolean;
  hideFromStatusBar?: boolean;
  hideFromActivityBar?: boolean;
}
export interface RegexConfiguration {
  tags: string[];
  regex: string;
  caseSensitive: boolean;
  multiLine?: boolean;
}
export interface UtilityConfiguration {
  tags(): string[];
  regex(): RegexConfiguration;
  isRegexCaseSensitive(): boolean;
  subTagRegex(): string;
}
export interface AttributeConfiguration {
  customHighlight(): Record<string, HighlightSettings>;
  defaultHighlight(): HighlightSettings;
  isRegexCaseSensitive(): boolean;
  shouldUseColourScheme(): boolean;
  tags(): string[];
  backgroundColourScheme(): string[];
  foregroundColourScheme(): string[];
}
export interface ThemeStyle extends vscode.ThemableDecorationRenderOptions {
  textShadow?: string;
}
export interface ThemedStyle {
  light: ThemeStyle;
  dark: ThemeStyle;
  borderRadius?: string;
}
export type TextChannels = Partial<Record<'color' | 'font' | 'glow', ThemedStyle>>;
export interface HighlightChannel {
  kind: string;
  enabled: boolean;
  rangeType?: string;
  style: ThemedStyle;
}
export interface HighlightChannelOptions {
  scheme?: string;
  schemePreset?: Partial<Record<'glass' | 'glow', ThemedStyle>>;
  colorType?: string;
  glowType?: string;
  glassType?: string;
  fontType?: string;
  lightForegroundColour?: string | vscode.ThemeColor;
  darkForegroundColour?: string | vscode.ThemeColor;
  lightBackgroundColour?: string | vscode.ThemeColor;
  darkBackgroundColour?: string | vscode.ThemeColor;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  borderRadius?: string;
}
export interface TagPlan {
  tag: string;
  channels: Record<'color' | 'glow' | 'glass' | 'font', HighlightChannel>;
  meta: {
    lane?: vscode.OverviewRulerLane;
    rulerColour?: string | vscode.ThemeColor;
    gutterIconPath?: string | vscode.Uri;
  };
}
