
import React from 'react';
import JobConsole from '@/components/jobs/JobConsole';

// Placeholder for the table listing past and current jobs
const JobHistoryTable = () => (
  <div className="bg-gray-800 p-6 rounded-lg">
    <h2 className="text-2xl font-bold mb-4">Job History</h2>
    <p>Table of historical jobs will go here.</p>
  </div>
);

const JobsPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Jobs</h1>
      <JobConsole />
      <JobHistoryTable />
    </div>
  );
};

export default JobsPage;
