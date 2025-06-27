// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
//ts-morph for oprning and scanning files lineby line
import { Project, SyntaxKind} from 'ts-morph';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
const diagnosticCollection = vscode.languages.createDiagnosticCollection('performanceAnalyzer');
const debounceMap = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext) {

  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.commands.registerCommand('performance-analyser-v1-0-0.runAudit', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Running Performance Audit',
        cancellable: false,
      }, async (progress) => {
        progress.report({ message: 'Scanning files...' });
        const allDiagnostics = await runFullAudit();
        applyDiagnostics(allDiagnostics);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('performance-analyser-v1-0-0.clearDiagnostics', () => {
      diagnosticCollection.clear();
      vscode.window.showInformationMessage('Cleared all diagnostics.');
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(['typescript', 'html'], new PerformanceFixProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    })
  );

  vscode.workspace.onDidOpenTextDocument(async (doc) => {
    const diagnostics = await runAuditOnDocument(doc);
    if (diagnostics.length > 0) {
      diagnosticCollection.set(doc.uri, diagnostics);
    } else {
      diagnosticCollection.delete(doc.uri);
    }
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    const uri = event.document.uri.toString();
    clearTimeout(debounceMap.get(uri));

    const timer = setTimeout(async () => {
      const diagnostics = await runAuditOnDocument(event.document);
      if (diagnostics.length > 0) {
        diagnosticCollection.set(event.document.uri, diagnostics);
      } else {
        diagnosticCollection.delete(event.document.uri);
      }
    }, 500);

    debounceMap.set(uri, timer);
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
}

//here we search all files 
async function runFullAudit(): Promise<Map<vscode.Uri, vscode.Diagnostic[]>> {
  const diagnosticsMap = new Map<vscode.Uri, vscode.Diagnostic[]>();

  const htmlFiles = await vscode.workspace.findFiles('**/*.html', '**/node_modules/**');
  const tsFiles = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');

  for (const file of htmlFiles) {
    const doc = await vscode.workspace.openTextDocument(file);
    const diags = await auditHtmlDocument(doc);
    diagnosticsMap.set(doc.uri, diags);
  }

  for (const file of tsFiles) {
    const doc = await vscode.workspace.openTextDocument(file);
    const relevant = isRelevantTsFile(doc);
    if (!relevant) {
      continue;
    }
    const diags = await auditTsDocument(doc);
    diagnosticsMap.set(doc.uri, (diagnosticsMap.get(doc.uri) || []).concat(diags));
  }

  return diagnosticsMap;
}

async function runAuditOnDocument(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  if (doc.languageId === 'html') {
    return auditHtmlDocument(doc);
  } else if (doc.languageId === 'typescript') {
	//if it is not rotintg no need to search lazy loading
    return isRelevantTsFile(doc) ? auditTsDocument(doc) : [];
  }
  return [];
}

function isRelevantTsFile(doc: vscode.TextDocument): boolean {
  const content = doc.getText();
  return (
    doc.uri.fsPath.includes('routing') ||
    content.includes('subscribe') ||
    content.includes('window.addEventListener') ||
    content.includes('console.log') ||
    content.includes('import * as')
  );
}

async function auditHtmlDocument(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = doc.getText();
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index;
    if (line.includes('<img') && !line.includes('loading="lazy"')) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(lineNum, 0, lineNum, line.length),
        'Missing loading="lazy" on <img> tag',
        vscode.DiagnosticSeverity.Warning
      ));
    }
    const match = line.match(/<img[^>]*src=["']([^"']+)["']/);
    if (match) {
      const src = match[1];
      if (!src.endsWith('.webp') && !src.endsWith('.avif')) {
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(lineNum, 0, lineNum, line.length),
          `Consider using modern image format (.webp/.avif) instead of "${src}"`,
          vscode.DiagnosticSeverity.Warning
        ));
      }
    }

    // Inline styles in templates
    if (line.includes('style="')) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(lineNum, 0, lineNum, line.length),
        'Avoid using inline styles in templates. Use CSS classes instead.',
        vscode.DiagnosticSeverity.Warning
      ));
    }
  });

  return diagnostics;
}

async function auditTsDocument(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const diagnostics: vscode.Diagnostic[] = [];
  const filePath = doc.uri.fsPath;
  const sourceText = doc.getText();
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(filePath, sourceText);

  // Check for missing loadChildren in routing files
  if (filePath.includes('routing')) {
    const arrays = sourceFile.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression);
    for (const array of arrays) {
      for (const el of array.getElements()) {
        const obj = el.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!obj) {
          continue;
        }

        const componentProp = obj.getProperty('component');
        const loadChildrenProp = obj.getProperty('loadChildren');

        if (componentProp && !loadChildrenProp) {
          const line = doc.positionAt(componentProp.getStart()).line;
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(line, 0, line, 1000),
            'Consider using lazy loading (loadChildren) instead of component.',
            vscode.DiagnosticSeverity.Warning
          ));
        }
      }
    }
  }

  // Check for unclosed subscriptions
  const subscribes = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter(c => c.getExpression().getText().includes('subscribe'));
  for (const call of subscribes) {
    const text = call.getText();
    if (!text.includes('takeUntil')) {
      const line = doc.positionAt(call.getStart()).line;
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(line, 0, line, 1000),
        'Subscription missing takeUntil — might cause memory leaks.',
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  // Check for console.log
  if (sourceText.includes('console.log')) {
    const lines = sourceText.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('console.log')) {
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(index, 0, index, line.length),
          'Avoid using console.log in production code.',
          vscode.DiagnosticSeverity.Warning
        ));
      }
    });
  }

  // Check for importing everything from a library
  const imports = sourceFile.getImportDeclarations();
  imports.forEach(imp => {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (imp.getNamespaceImport()) {
      const line = doc.positionAt(imp.getStart()).line;
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(line, 0, line, 1000),
        `Avoid importing everything from '${moduleSpecifier}'. Import only what you need.`,
        vscode.DiagnosticSeverity.Warning
      ));
    }
  });

  // Check for direct use of window.addEventListener without cleanup
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expressionText = call.getExpression().getText();
    if (expressionText.includes('window.addEventListener')) {
      const line = doc.positionAt(call.getStart()).line;
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(line, 0, line, 1000),
        'window.addEventListener used without visible cleanup. Consider removing it in ngOnDestroy.',
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  return diagnostics;
}

//clear diagnostis function
function applyDiagnostics(diagnosticsMap: Map<vscode.Uri, vscode.Diagnostic[]>) {
  for (const [uri, diagnostics] of diagnosticsMap.entries()) {
    if (diagnostics.length > 0) {
      diagnosticCollection.set(uri, diagnostics);
    } else {
      diagnosticCollection.delete(uri);
    }
  }
}

//here this is for quickfix suggestions
class PerformanceFixProvider implements vscode.CodeActionProvider {
  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
    const diagnostics = diagnosticCollection.get(document.uri)?.filter(d => d.range.intersection(range));
    if (!diagnostics || diagnostics.length === 0) {
      return;
    }

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      const lineText = document.lineAt(diagnostic.range.start.line).text;
//typescript liberaries to modiy vscode 
      if (diagnostic.message.includes('loading="lazy"')) {
        const fix = new vscode.CodeAction('Add loading="lazy"', vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        const updated = lineText.replace('<img', '<img loading="lazy"');
        fix.edit.replace(document.uri, new vscode.Range(diagnostic.range.start.line, 0, diagnostic.range.start.line, lineText.length), updated);
        fix.diagnostics = [diagnostic];
        actions.push(fix);
      }

      if (diagnostic.message.includes('console.log')) {
        const fix = new vscode.CodeAction('Remove console.log line', vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.delete(document.uri, new vscode.Range(diagnostic.range.start.line, 0, diagnostic.range.start.line + 1, 0));
        fix.diagnostics = [diagnostic];
        actions.push(fix);
      }

      if (diagnostic.message.includes('modern image format')) {
        const match = lineText.match(/src=\"([^\"]+)\"/);
        if (match) {
          const originalSrc = match[1];
          if (originalSrc.endsWith('.jpg') || originalSrc.endsWith('.jpeg') || originalSrc.endsWith('.png')) {
            const newSrc = originalSrc.replace(/\.(jpg|jpeg|png)/, '.webp');
            const updated = lineText.replace(originalSrc, newSrc);
            const fix = new vscode.CodeAction(`Convert to .webp`, vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(document.uri, new vscode.Range(diagnostic.range.start.line, 0, diagnostic.range.start.line, lineText.length), updated);
            fix.diagnostics = [diagnostic];
            actions.push(fix);
          }
        }
      }
    }

    return actions;
  }
}