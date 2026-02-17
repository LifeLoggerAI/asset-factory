
import { Job } from '../types/job';

export const submitJob = async (jobData: Omit<Job, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<{ message: string, jobId: string, data: any }> => {
  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to submit job:", error);
    throw new Error("Failed to submit job. Please check the console for more details.");
  }
};
