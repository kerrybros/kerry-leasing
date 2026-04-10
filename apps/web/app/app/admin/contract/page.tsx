'use client';

import { ExternalLink, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const mockPreviousVersions = [
  { version: 'v1.0', signedDate: 'March 15, 2022', term: '2 years', status: 'Superseded', link: null },
  { version: 'v2.0', signedDate: 'March 15, 2024', term: '3 years', status: 'Superseded', link: null },
];

export default function AdminContractPage() {
  return (
    <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Contract</h1>
        <p className="text-sm text-muted-foreground">
          Active lease agreement and version history.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Contract management coming soon — document links and version tracking will be available here.
      </div>

      {/* Active Contract */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Active Contract
          </CardTitle>
          <CardDescription>Current signed lease agreement.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="default">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">v3.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signed date</span>
              <span className="font-medium">—</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Contract document</span>
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 text-muted-foreground cursor-not-allowed text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Link not yet configured
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Previous Versions */}
      <Card>
        <CardHeader>
          <CardTitle>Previous Versions</CardTitle>
          <CardDescription>Historical contract versions for reference.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Version</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Signed Date</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Term</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Document</th>
                </tr>
              </thead>
              <tbody>
                {mockPreviousVersions.map((row) => (
                  <tr key={row.version} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium">{row.version}</td>
                    <td className="py-2.5 text-muted-foreground">{row.signedDate}</td>
                    <td className="py-2.5 text-muted-foreground">{row.term}</td>
                    <td className="py-2.5">
                      <Badge variant="secondary">{row.status}</Badge>
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">Not linked</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
