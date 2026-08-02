export type RunStatus =
	| "planning"
	| "ready"
	| "executing"
	| "reviewing"
	| "completed"
	| "paused"
	| "failed";

export type TodoStatus = "open" | "in_progress" | "blocked" | "done" | "failed";
export type TodoPriority = "high" | "medium" | "low";

export interface RepositoryIdentity {
	id: string;
	root: string;
	commonDir: string;
	remote?: string;
}

export interface WorkspaceScope {
	type: "workspace";
	provider: "superconductor";
	name: string;
	path: string;
}

export interface RunParticipant {
	sessionId: string;
	role: string;
	label?: string;
	targetId?: string;
	todoId?: string;
	model?: string;
	reasoning?: string;
	joinedAt: string;
	updatedAt: string;
}

export interface RunManifest {
	schema: 1;
	id: string;
	title: string;
	status: RunStatus;
	phase: string;
	createdAt: string;
	updatedAt: string;
	repository: RepositoryIdentity;
	participants: RunParticipant[];
	scope?: WorkspaceScope;
}

export interface RunMembership {
	runId: string;
	projectPath: string;
	root: string;
	role: string;
	label?: string;
	targetId?: string;
	todoId?: string;
	joinedAt: string;
	scope?: WorkspaceScope;
}

export interface TodoAssignment {
	sessionId: string;
	role: string;
	label?: string;
	targetId?: string;
	claimedAt: string;
}

export interface TodoClaimRecovery {
	releasedAssignment: TodoAssignment;
	releasedBy: {
		sessionId: string;
		role: string;
		label?: string;
		targetId?: string;
	};
	reason: string;
	releasedAt: string;
}

export interface TodoMetadata {
	schema: 1;
	id: string;
	title: string;
	status: TodoStatus;
	priority: TodoPriority;
	tags: string[];
	dependsOn: string[];
	assignedTo?: TodoAssignment;
	claimRecoveries?: TodoClaimRecovery[];
	artifactRefs: string[];
	verification?: string;
	blockedReason?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

export interface TodoRecord extends TodoMetadata {
	body: string;
}

export interface ArtifactInfo {
	path: string;
	bytes: number;
	updatedAt: string;
}
