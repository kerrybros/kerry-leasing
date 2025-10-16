import { CustomerConfig } from './customer-config'

export class ServiceRequestHandler {
  constructor(private customerConfig: CustomerConfig) {}

  // Generate service request based on customer configuration
  async handleServiceRequest(vehicleId: string, description?: string): Promise<{
    success: boolean
    message: string
    redirectUrl?: string
  }> {
    const { serviceRequest } = this.customerConfig

    if (!serviceRequest.enabled) {
      return {
        success: false,
        message: 'Service requests are not enabled for this fleet'
      }
    }

    switch (serviceRequest.type) {
      case 'external_link':
        return this.handleExternalLink(vehicleId, description)
      
      case 'email':
        return this.handleEmailRequest(vehicleId, description)
      
      case 'form':
        return this.handleFormRequest(vehicleId, description)
      
      case 'api':
        return this.handleApiRequest(vehicleId, description)
      
      default:
        return {
          success: false,
          message: 'Service request type not configured'
        }
    }
  }

  private handleExternalLink(vehicleId: string, description?: string): Promise<{
    success: boolean
    message: string
    redirectUrl?: string
  }> {
    const { config } = this.customerConfig.serviceRequest
    let url = config.url || ''

    // Replace placeholders
    url = url.replace('{vehicleId}', encodeURIComponent(vehicleId))
    if (description) {
      url += url.includes('?') ? '&' : '?'
      url += `description=${encodeURIComponent(description)}`
    }

    return Promise.resolve({
      success: true,
      message: 'Redirecting to service request system...',
      redirectUrl: url
    })
  }

  private async handleEmailRequest(vehicleId: string, description?: string): Promise<{
    success: boolean
    message: string
  }> {
    const { config } = this.customerConfig.serviceRequest
    
    const subject = (config.subject || 'Service Request')
      .replace('{vehicleId}', vehicleId)
    
    const body = `
Service Request Details:
Vehicle ID: ${vehicleId}
Customer: ${this.customerConfig.name}
${description ? `Description: ${description}` : ''}

Please process this service request at your earliest convenience.
    `.trim()

    // Create mailto link
    const mailtoUrl = `mailto:${config.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    
    // Open email client
    if (typeof window !== 'undefined') {
      window.location.href = mailtoUrl
    }

    return {
      success: true,
      message: 'Opening email client...'
    }
  }

  private async handleFormRequest(vehicleId: string, description?: string): Promise<{
    success: boolean
    message: string
  }> {
    // This would integrate with your form system
    // For now, return a placeholder
    return {
      success: true,
      message: 'Service request form will be displayed'
    }
  }

  private async handleApiRequest(vehicleId: string, description?: string): Promise<{
    success: boolean
    message: string
  }> {
    const { config } = this.customerConfig.serviceRequest

    try {
      const response = await fetch(config.apiEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          vehicleId,
          description,
          customerId: this.customerConfig.id,
          customerName: this.customerConfig.name,
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        return {
          success: true,
          message: 'Service request submitted successfully'
        }
      } else {
        throw new Error(`API request failed: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Service request API error:', error)
      return {
        success: false,
        message: 'Failed to submit service request. Please try again.'
      }
    }
  }

  // Get service request button configuration
  getServiceRequestConfig() {
    const { serviceRequest } = this.customerConfig
    
    return {
      enabled: serviceRequest.enabled,
      buttonText: this.getButtonText(),
      buttonStyle: this.getButtonStyle(),
      requiresDescription: serviceRequest.type === 'form' || serviceRequest.type === 'api'
    }
  }

  private getButtonText(): string {
    switch (this.customerConfig.serviceRequest.type) {
      case 'external_link':
        return 'Request Service'
      case 'email':
        return 'Email Service Request'
      case 'form':
        return 'Submit Service Request'
      case 'api':
        return 'Request Service'
      default:
        return 'Service Request'
    }
  }

  private getButtonStyle(): string {
    // Return CSS classes based on customer branding
    return `bg-[${this.customerConfig.branding.primaryColor}] hover:bg-[${this.customerConfig.branding.secondaryColor}] text-white`
  }
}
