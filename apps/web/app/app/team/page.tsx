'use client';

import { useState } from 'react';
import { useOrganization, useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, UserPlus } from 'lucide-react';

function getRoleLabel(role: string) {
  if (role === 'org:admin') return 'Admin';
  return 'Member';
}

export default function TeamPage() {
  const { user } = useUser();
  const { organization, memberships, invitations } = useOrganization({
    memberships: { infinite: true, keepPreviousData: true },
    invitations: { status: ['pending'], infinite: true, keepPreviousData: true },
  });

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const isAdmin = memberships?.data?.find(
    m => m.publicUserData?.userId === user?.id
  )?.role === 'org:admin';

  const isInternalEmail = (e?: string | null) =>
    !!e && e.toLowerCase().endsWith('@kerrybros.com');

  const visibleMembers = isAdmin
    ? memberships?.data
    : memberships?.data?.filter(m => !isInternalEmail(m.publicUserData?.identifier));
  const visibleInvitations = isAdmin
    ? invitations?.data
    : invitations?.data?.filter(inv => !isInternalEmail(inv.emailAddress));

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!organization || !email.trim()) return;
    setSending(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await organization.inviteMember({ emailAddress: email.trim(), role: 'org:member' });
      setEmail('');
      setSuccessMsg(`Invitation sent to ${email.trim()}`);
      invitations?.revalidate?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invitation.';
      setErrorMsg(msg);
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    const inv = invitations?.data?.find(i => i.id === invitationId);
    if (!inv) return;
    await inv.revoke();
    invitations?.revalidate?.();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold leading-none">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {organization?.name} · {visibleMembers?.length ?? 0} member{visibleMembers?.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Members
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {memberships?.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMembers?.map(m => {
                  const name = [m.publicUserData?.firstName, m.publicUserData?.lastName]
                    .filter(Boolean).join(' ') || '—';
                  const email = m.publicUserData?.identifier ?? '—';
                  const role = getRoleLabel(m.role);
                  const joined = new Date(m.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });
                  const isMe = m.publicUserData?.userId === user?.id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="pl-4 font-medium">
                        {name}
                        {isMe && (
                          <span className="ml-2 text-[10px] text-muted-foreground font-normal">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{email}</TableCell>
                      <TableCell>
                        <Badge variant={role === 'Admin' ? 'default' : 'secondary'} className="text-[10px]">
                          {role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{joined}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {visibleInvitations && visibleInvitations.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pending Invitations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Email</TableHead>
                  <TableHead>Sent</TableHead>
                  {isAdmin && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleInvitations.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="pl-4 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{inv.emailAddress}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(inv.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right pr-4">
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Revoke
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite form — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Invite Member
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <form onSubmit={handleInvite} className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="flex-1"
                disabled={sending}
              />
              <Button type="submit" disabled={sending || !email.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invite'}
              </Button>
            </form>
            {successMsg && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-2">{successMsg}</p>
            )}
            {errorMsg && (
              <p className="text-sm text-destructive mt-2">{errorMsg}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
