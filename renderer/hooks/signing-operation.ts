export class SigningOperationGuard {
  private revision = 0;

  begin(): number {
    this.revision += 1;
    return this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }

  isCurrent(operationId: number): boolean {
    return operationId === this.revision;
  }
}
