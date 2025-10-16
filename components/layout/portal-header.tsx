'use client'

import { UserButton } from '@clerk/nextjs'
import Image from 'next/image'
import { CustomerConfig } from '@/lib/customer-config'

interface PortalHeaderProps {
  customerConfig: CustomerConfig
  user: any
  title?: string
  subtitle?: string
}

export function PortalHeader({ 
  customerConfig, 
  user, 
  title = "Fleet Management", 
  subtitle 
}: PortalHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Image 
              src={customerConfig.branding.logoUrl || "/Kerry Leasing with background.png"}
              alt={`${customerConfig.branding.companyName} Logo`}
              width={150}
              height={45}
              className="h-12 w-auto"
              priority
            />
            <div className="border-l border-slate-300 pl-4">
              <h1 className="text-lg font-semibold text-slate-800">{customerConfig.name}</h1>
              <p className="text-sm text-slate-500">{title}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-slate-700 font-medium">
              Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </div>
    </header>
  )
}
