import { OwaspComplianceReport } from './owasp-mapper';

const STATUS_LABELS: Record<string, string> = {
  mitigated: 'MITIGATED',
  partial: 'PARTIAL',
  not_applicable: 'NOT APPLICABLE'
};

export class OwaspReportRenderer {
  static toMarkdown(report: OwaspComplianceReport): string {
    const lines: string[] = [
      '# OWASP ASI Compliance Report',
      '',
      `Run: ${report.executionId} | Tool: swarm-orchestrator v${report.toolVersion} | Date: ${report.generatedAt}`,
      '',
      '## Summary',
      '',
      `Applicable risks: ${report.applicableRisks}/10`,
      `Mitigated: ${report.mitigatedRisks} | Partial: ${report.partialRisks} | Not applicable: ${report.notApplicableRisks}`,
      '',
      '## Risk Assessment',
      ''
    ];

    for (const risk of report.risks) {
      lines.push(`### ${risk.asiId}: ${risk.riskName}`);
      lines.push(`Status: ${STATUS_LABELS[risk.status]}`);

      if (risk.evidence.length > 0) {
        lines.push(`Evidence: ${risk.evidence.join(', ')}`);
      }

      lines.push(`Rationale: ${risk.rationale}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  static toJson(report: OwaspComplianceReport): string {
    return JSON.stringify(report, null, 2);
  }
}
