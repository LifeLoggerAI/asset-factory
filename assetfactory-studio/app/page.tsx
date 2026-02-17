
import JobConsole from "@/components/jobs/JobConsole";
import JobList from "@/components/jobs/JobList";

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <JobConsole />
      <JobList />
    </div>
  );
}
