export const checkPermissions = (userRole: string) => {
  if (userRole !== "owner" && userRole !== "admin" && userRole !== "editor") {
    throw new Error("Insufficient permissions");
  }
};
