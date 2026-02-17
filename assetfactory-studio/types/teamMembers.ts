export interface TeamMember {
  id: string;
  projectId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}
