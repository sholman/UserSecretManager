namespace UserSecretManager.Models;

/// <summary>
/// Represents a .NET project with User Secrets configuration.
/// </summary>
public class ProjectInfo
{
    /// <summary>
    /// The name of the project (derived from .csproj filename).
    /// </summary>
    public required string Name { get; init; }
    
    /// <summary>
    /// Full path to the .csproj file.
    /// </summary>
    public required string ProjectPath { get; init; }
    
    /// <summary>
    /// Directory containing the project.
    /// </summary>
    public string ProjectDirectory => Path.GetDirectoryName(ProjectPath) ?? string.Empty;
    
    /// <summary>
    /// The UserSecretsId GUID from the .csproj file.
    /// </summary>
    public required string UserSecretsId { get; init; }
    
    /// <summary>
    /// Full path to the secrets.json file.
    /// </summary>
    public required string SecretsFilePath { get; init; }
    
    /// <summary>
    /// Whether the secrets.json file exists.
    /// </summary>
    public bool SecretsFileExists => File.Exists(SecretsFilePath);
    
    /// <summary>
    /// Paths to appsettings*.json files found in the project directory.
    /// </summary>
    public List<string> AppSettingsFiles { get; init; } = [];
}
