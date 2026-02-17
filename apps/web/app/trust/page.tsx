
import React from 'react';

const TrustPage = () => {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold">Security & Trust at Asset Factory</h1>
        <p className="mt-4 text-lg text-gray-600">
          Enterprise-grade production infrastructure requires institutional-grade controls.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="p-6 border rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Infrastructure Security</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Hosted on Google Cloud infrastructure</li>
            <li>Data encrypted at rest and in transit</li>
            <li>Multi-factor authentication for admin users</li>
            <li>Strict Role-Based Access Controls (RBAC)</li>
          </ul>
        </div>

        <div className="p-6 border rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Deterministic Processing Integrity</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Version-locked generation pipelines</li>
            <li>Deterministic seed enforcement for reproducibility</li>
            <li>Output manifest hashing for verification</li>
            <li>Full traceability of model versions per job</li>
          </ul>
        </div>

        <div className="p-6 border rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Availability & Business Continuity</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>99.5%+ uptime commitment for enterprise tiers</li>
            <li>Daily encrypted backups of all critical data</li>
            <li>Documented and tested Disaster Recovery Plan</li>
          </ul>
        </div>

        <div className="p-6 border rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Compliance & Governance</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>SOC 2 Type I readiness</li>
            <li>Formal security policies governing operations</li>
            <li>Quarterly access reviews to ensure least privilege</li>
            <li>Formal vendor risk management program</li>
          </ul>
        </div>

        <div className="p-6 border rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Responsible AI</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Strict enforcement of structured input schemas</li>
            <li>Brand-safe presets to control generation guardrails</li>
            <li>Model version locking to prevent unexpected drift</li>
            <li>No client data is used for model training without consent</li>
          </ul>
        </div>

        <div className="p-6 border rounded-lg bg-gray-50">
          <h2 className="text-2xl font-semibold mb-4">Contact</h2>
          <p>
            For security inquiries, to report a vulnerability, or to request our full compliance packet, please contact our security team.
          </p>
          <a href="mailto:security@assetfactory.app" className="font-semibold text-blue-600 mt-2 inline-block">
            security@assetfactory.app
          </a>
          <p className="text-sm text-gray-500 mt-1">Response within 24 hours.</p>
        </div>
      </div>
    </div>
  );
};

export default TrustPage;
