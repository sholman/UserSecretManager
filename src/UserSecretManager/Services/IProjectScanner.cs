using UserSecretManager.Models;

namespace UserSecretManager.Services;

/// <summary>
/// Interface for scanning directories for .NET projects with User Secrets.
/// </summary>
public interface IProjectScanner
{
    /// <summary>
    /// Recursively scans a directory for .csproj files with UserSecretsId.
    /// </summary>
    Task<IReadOnlyList<ProjectInfo>> ScanDirectoryAsync(
        string directoryPath,
        CancellationToken cancellationToken = default);
}
