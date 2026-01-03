using System.Xml.Linq;
using UserSecretManager.Models;

namespace UserSecretManager.Services;

/// <summary>
/// Service for scanning directories and finding .NET projects with User Secrets.
/// </summary>
public class ProjectScanner : IProjectScanner
{
    /// <summary>
    /// Recursively scans a directory for .csproj files with UserSecretsId.
    /// </summary>
    /// <param name="directoryPath">The root directory to scan.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Collection of projects with User Secrets configured.</returns>
    public async Task<IReadOnlyList<ProjectInfo>> ScanDirectoryAsync(
        string directoryPath,
        CancellationToken cancellationToken = default)
    {
        var projects = new List<ProjectInfo>();
        
        if (!Directory.Exists(directoryPath))
        {
            return projects;
        }

        var csprojFiles = Directory.EnumerateFiles(
            directoryPath,
            "*.csproj",
            new EnumerationOptions
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = true
            });

        foreach (var csprojPath in csprojFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            
            var projectInfo = await TryParseProjectAsync(csprojPath);
            if (projectInfo is not null)
            {
                projects.Add(projectInfo);
            }
        }

        // Deduplicate by UserSecretsId - multiple projects can share the same secrets file
        return projects
            .GroupBy(p => p.UserSecretsId)
            .Select(g => g.First())
            .OrderBy(p => p.Name)
            .ToList();
    }

    /// <summary>
    /// Attempts to parse a .csproj file and extract UserSecretsId.
    /// </summary>
    private async Task<ProjectInfo?> TryParseProjectAsync(string csprojPath)
    {
        try
        {
            var content = await File.ReadAllTextAsync(csprojPath);
            var doc = XDocument.Parse(content);
            
            var userSecretsId = doc.Descendants("UserSecretsId").FirstOrDefault()?.Value;
            
            if (string.IsNullOrWhiteSpace(userSecretsId))
            {
                return null;
            }

            var projectName = Path.GetFileNameWithoutExtension(csprojPath);
            var projectDirectory = Path.GetDirectoryName(csprojPath) ?? string.Empty;
            var secretsPath = GetSecretsFilePath(userSecretsId);
            
            // Find appsettings files in the project directory
            var appSettingsFiles = FindAppSettingsFiles(projectDirectory);

            return new ProjectInfo
            {
                Name = projectName,
                ProjectPath = csprojPath,
                UserSecretsId = userSecretsId,
                SecretsFilePath = secretsPath,
                AppSettingsFiles = appSettingsFiles
            };
        }
        catch (Exception)
        {
            // Log or handle parsing errors gracefully
            return null;
        }
    }

    /// <summary>
    /// Finds all appsettings*.json files in the project directory.
    /// </summary>
    private static List<string> FindAppSettingsFiles(string projectDirectory)
    {
        if (string.IsNullOrEmpty(projectDirectory) || !Directory.Exists(projectDirectory))
        {
            return [];
        }

        try
        {
            return Directory.GetFiles(projectDirectory, "appsettings*.json")
                .OrderBy(f => f.Length) // appsettings.json first, then appsettings.Development.json, etc.
                .ThenBy(f => f)
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// Gets the platform-specific path to the secrets.json file.
    /// </summary>
    private static string GetSecretsFilePath(string userSecretsId)
    {
        string basePath;
        
        if (OperatingSystem.IsWindows())
        {
            basePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft",
                "UserSecrets");
        }
        else
        {
            // macOS and Linux
            basePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".microsoft",
                "usersecrets");
        }

        return Path.Combine(basePath, userSecretsId, "secrets.json");
    }
}
