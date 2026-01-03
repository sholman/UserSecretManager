namespace UserSecretManager.Models;

/// <summary>
/// Represents an appsettings file for a project.
/// </summary>
public class AppSettingsFile
{
    /// <summary>
    /// Full path to the appsettings file.
    /// </summary>
    public required string FilePath { get; init; }
    
    /// <summary>
    /// File name (e.g., "appsettings.json", "appsettings.Development.json").
    /// </summary>
    public string FileName => Path.GetFileName(FilePath);
    
    /// <summary>
    /// The JSON content of the file.
    /// </summary>
    public string Content { get; set; } = "{}";
    
    /// <summary>
    /// Whether the content is valid JSON.
    /// </summary>
    public bool IsValidJson { get; set; } = true;
}
