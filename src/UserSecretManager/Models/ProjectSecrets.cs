namespace UserSecretManager.Models;

/// <summary>
/// Represents the secrets content for a project.
/// </summary>
public class ProjectSecrets
{
    /// <summary>
    /// The project this secrets content belongs to.
    /// </summary>
    public required ProjectInfo Project { get; init; }
    
    /// <summary>
    /// The raw JSON content of the secrets file.
    /// </summary>
    public string Content { get; set; } = "{}";
    
    /// <summary>
    /// Whether the content has been modified since last save.
    /// </summary>
    public bool IsDirty { get; set; }
    
    /// <summary>
    /// Last modified timestamp of the secrets file.
    /// </summary>
    public DateTime? LastModified { get; set; }
    
    /// <summary>
    /// Whether the current content is valid JSON.
    /// </summary>
    public bool IsValidJson { get; set; } = true;
    
    /// <summary>
    /// Validation error message if JSON is invalid.
    /// </summary>
    public string? ValidationError { get; set; }
}
